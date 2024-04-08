import {
    bracketBody,
    BracketToken,
    FloatLiteralToken,
    IdentifierToken,
    IntLiteralToken,
    Parser,
    PunctuationToken,
    StringLiteralToken,
    Token,
} from "../parser/mod.ts";
import { Span } from "../parser/span.ts";
import { CommentToken } from "../parser/tokens.ts";
import {
    EnumDeclarationStatement,
    FunctionDeclarationStatement,
    LanguagePattern,
    Statement,
    statement,
    TypeStatement,
    typeStatement,
} from "./mod.ts";
import {
    ExportModuleDeclaration,
    FlagStatement,
    ImportDeclaration,
    MatchStatement,
    StructDeclarationStatement,
    StructureDataStatement,
    TypeDefinition,
} from "./statements.ts";

export interface LangContext {
    [key: `ident-${string}`]: IdentifierToken;
    [key: `int-${string}`]: IntLiteralToken;
    [key: `float-${string}`]: FloatLiteralToken;
    [key: `string-${string}`]: StringLiteralToken;
    [key: `punct-${string}`]: PunctuationToken;
    [key: `doc-comment-${string}`]: CommentToken;
    [key: `expr-${string}`]: Token[];
    [key: `body-${string}`]: Token[];
    [key: `optional-generics-${string}`]: TypeStatement[];
    [key: `block-${string}`]: BracketToken;
    [key: `parenthesis-${string}`]: BracketToken;
    [key: `stm-${string}`]: Statement;
    [key: `type-${string}`]: TypeStatement;
    [key: `lh-expr-${string}`]: Statement | TypeStatement;
}

export class LanguageParser<T extends { "span": Span } = Statement> {
    public static Pattern = LanguagePattern;
    public tokens: Token[];
    public position = 0;
    public contextBuffer: number[] = [];
    public patterns: LanguagePattern<T>[] = [];

    public startContext() {
        this.contextBuffer.push(this.position);
    }
    public endContext(): Span {
        const start = this.contextBuffer.pop();
        const tokens = this.tokens.slice(start, this.position);
        return tokens.at(0)?.span.join(tokens.at(-1)?.span!)!;
    }

    public peek(): undefined | Token {
        return this.tokens[this.position];
    }
    public next(): undefined | Token {
        return this.tokens[this.position++];
    }

    public statement(nesting?: T): T | undefined {
        // console.log("nest",nesting);
        for (const pattern of this.patterns) {
            // console.log("start match",pattern.name);
            const e = pattern.match(this, nesting);
            if (e) {
                // console.log("nest check")
                //check if it can be nested
                const ee = this.statement(e);
                // console.log(ee);
                if (ee) return ee;
                return e;
            }
            this.position = this.contextBuffer.pop() ?? this.position;
            continue;
        }

        return undefined;
    }
    public statementUsing<K extends { "span": Span }>(
        patterns: LanguagePattern<K>[],
    ): K | undefined {
        const p = new LanguageParser(
            this.tokens.slice(this.position),
            patterns,
        );
        const rtn = p.statement();
        this.position += p.position;
        return rtn;
    }
    public typeStatement(nesting?: TypeStatement): TypeStatement | undefined {
        // console.log("nest",nesting);
        for (const pattern of LanguageParser.typePattern) {
            //@ts-ignore ts winning about isType Marker
            const e = pattern.match(this, nesting);
            if (e) {
                //check if it can be nested
                const ee = this.typeStatement(e);
                if (ee) return ee;
                return e;
            }
            this.position = this.contextBuffer.pop() ?? this.position;
            continue;
        }
        return undefined;
    }
    public statements(): T[] {
        const body: T[] = [];
        while (true) {
            // console.log("b",this.peek());
            const a = this.statement();
            // console.log("c");

            if (!a) break;
            body.push(a);
        }
        if (this.position < this.tokens.length) {
            this.peek()?.span.errorUnexpected(undefined, undefined, undefined);
        }
        return body;
    }

    public argumentList(bodySpan?: Span): { "type": "args"; "args": T[] } {
        const a: ReturnType<typeof this.argumentList> = {
            "type": "args",
            "args": [],
        };
        // console.log(this.tokens);
        while (true) {
            const stm = this.statement();
            // console.log("arg list ",stm);
            if (stm) a.args.push(stm);

            if (
                this.peek()?.type != "punct" ||
                this.peek()?.span.content() != ","
            ) {
                break;
            }
            this.next();
        }
        // this.next()
        return a;
    }
    public typeArgumentList(): TypeStatement[] {
        const a: TypeStatement[] = [];
        while (true) {
            const stm = this.typeStatement();
            // console.log("arg list ",stm);
            if (stm) a.push(stm);
            if (
                this.peek()?.type != "punct" ||
                this.peek()?.span.content() != ","
            ) break;
        }
        // this.next()
        return a;
    }

    constructor(tokens: Token[], patterns: LanguagePattern<T>[]) {
        this.tokens = tokens;
        this.patterns = patterns;
    }
    static default(tokens: Token[]) {
        return new LanguageParser(tokens, LanguageParser.defaultPatterns);
    }

    static typePattern: LanguagePattern<TypeStatement>[] = [
        //TODO: type-stm has to be a typelist
        new LanguagePattern(
            "Ident Generic",
            "#ident-name < #type-stm >",
            (ctx) => {
                return {
                    "type": "generic",
                    "name": ctx["ident-name"],
                    "generic-value": [ctx["type-stm"]],
                    "isType": true,
                };
            },
        ),
        new LanguagePattern(
            "Type Accessor using a dot",
            "#lh-expr-pre . #ident-name",
            (ctx) => {
                return {
                    "type": "dot",
                    "lhs": typeStatement(ctx["lh-expr-pre"]),
                    "rhs": ctx["ident-name"],
                    "isType": true,
                };
            },
        ),
        new LanguagePattern("Tuple Type", "#parenthesis-t", (ctx) => {
            return {
                "type": "tuple",
                "types": LanguageParser.default(
                    bracketBody(ctx["parenthesis-t"]),
                ).typeArgumentList(),
                "isType": true,
            };
        }),
        new LanguagePattern("Type Name", "#ident-name", (ctx) => {
            return {
                "type": "type",
                "name": ctx["ident-name"],
                "isType": true,
            };
        }),
    ];
    static defaultPatterns: LanguagePattern<Statement>[] = [
        new LanguagePattern("Loop", "loop #block-body", (ctx) => {
            //A loop statement is just a while true loop. treat it as such
            //create the true identifier
            const ident_buffer = new Span(
                "buffer://ident#true",
                0,
                4,
                "true",
                "true",
            );
            const expr: Statement = {
                "type": "ident",
                "ident": {
                    "span": ident_buffer,
                    "type": "ident",
                },
                "span": ident_buffer,
            };
            return {
                "type": "while",
                "expr": expr,
                "body": LanguageParser.default(bracketBody(ctx["block-body"]))
                    .statements(),
            };
        }),
        
        new LanguagePattern(
            "Structured Data",
            "#type-name #block-body",
            (ctx) => {
                const body = LanguageParser.default(
                    bracketBody(ctx["block-body"]),
                );

                const properties: StructureDataStatement["properties"] = {};

                while (true) {
                    const t = body.next();
                    if (!t) break;
                    if (t.type != "ident") {throw t.span.errorTodo(
                            "expected ident",
                        );}
                    const s = body.next();
                    if (!s) throw t.span.errorTodo("expected : after");
                    if (s.type != "punct" || s.span.content() != ":") {throw s
                            .span.errorTodo("expected: :");}
                    const expr = body.statement();
                    if (!expr) {throw s.span.errorTodo(
                            "expected statement after",
                        );}
                    properties[t.span.content()] = { "ident": t, "rhs": expr };
                    const comma = body.next();
                    if (!comma) break;
                    if (
                        comma.type != "punct" || comma.span.content() != ","
                    ) comma.span.errorTodo("expected ,");
                }

                return {
                    "type": "struct-data",
                    "name": ctx["type-name"],
                    "properties": properties,
                } satisfies Omit<StructureDataStatement, "span">;
            },
        ),

        new LanguagePattern(
            "For a in b loop",
            "for #parenthesis-e #block-body",
            (ctx) => {
                const expr = LanguageParser.default(
                    bracketBody(ctx["parenthesis-e"]),
                );
                // if(expr.length != 3)ctx["parenthesis-e"].span.errorTodo("(for(a in b) Expected only three argument, got "+ expr.length);
                const ident = expr.statement();
                if (ident?.type != "ident") {
                    throw ctx["parenthesis-e"].span.errorUnexpected([
                        "<ident>",
                    ]);
                }
                const in_ident = expr.statement();
                if (
                    in_ident?.type != "ident" ||
                    in_ident.ident.span.content() != "in"
                ) {throw (in_ident?.span ?? ctx["parenthesis-e"].span)
                        .errorUnexpected(["`in`"]);}
                const of_expr = expr.statement();
                if (of_expr === undefined) {
                    throw in_ident.span.errorTodo("forgot thids");
                }
                //now the body should be empty
                const empty = expr.statement();
                if (empty !== undefined) {
                    empty.span.errorUnexpected(
                        [],
                        "There cant be more expressions in a for loop",
                    );
                }

                //the middle expression should be
                // expr[1]

                return {
                    "type": "for",
                    "ident": ident.ident,
                    "expr": of_expr,
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                };
            },
        ),

        new LanguagePattern(
            "While loop",
            "while #parenthesis-e #block-body",
            (ctx) => {
                const expr = LanguageParser.default(
                    bracketBody(ctx["parenthesis-e"]),
                ).statements();
                if (expr.length != 1) {
                    ctx["parenthesis-e"].span.errorTodo(
                        "Expected only one argument, got " + expr.length,
                    );
                }

                return {
                    "type": "while",
                    "expr": expr[0],
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                };
            },
        ),
        

        new LanguagePattern(
            "struct",
            "struct #ident-name #optional-generics-gen #block-body",
            (ctx) => {
                const body = bracketBody(ctx["block-body"]);
                const sub = new LanguageParser(
                    body,
                    LanguageParser.defaultPatterns,
                );
                const properties: StructDeclarationStatement["properties"] = {};
                while (true) {
                    const t = sub.next();
                    if (!t) break;
                    if (t.type != "ident") {throw t.span.errorTodo(
                            "expected identifier",
                        );}
                    const name = t.span.content();
                    const p = sub.next();
                    if (!p) {
                        throw t.span.errorTodo('expected ":" after identifer');
                    }
                    if (p.type != "punct" || p.span.content() != ":") {p.span
                            .errorTodo('expected: ":"');}
                    const ty = sub.typeStatement();
                    if (!ty) throw p.span.errorTodo("expected type after this");

                    properties[name] = {
                        "ident": t,
                        "type": ty,
                    };

                    const comma = sub.next();
                    if (!comma) break;
                    if (
                        comma.type != "punct" || comma.span.content() != ","
                    ) comma.span.errorTodo("expected a comma");
                }
                return {
                    "type": "struct",
                    "generics":
                        ctx["optional-generics-gen"] as TypeDefinition[],
                    "name": ctx["ident-name"],
                    "properties": properties,
                } satisfies Omit<StructDeclarationStatement, "span">;
            },
        ),
        new LanguagePattern(
            "Trait Definition",
            "trait #ident-name #optional-generics-gen #block-body",
            (ctx) => {
                return {};
            },
        ),

        new LanguagePattern("await", "await #stm-expr;", (ctx) => {
            return {
                "type": "await",
                "body": ctx["stm-expr"],
            };
        }),

        new LanguagePattern("Line Terminator", "#lh-expr-a ;", (ctx) => {
            return statement(ctx["lh-expr-a"]);
        }),
        new LanguagePattern(
            "Let Declaration with Inferred Type",
            "let #ident-name = #stm-rhs",
            (ctx) => {
                return {
                    "type": "let",
                    "identifier": ctx["ident-name"],
                    "value-type": undefined,
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "Let Declaration with Type",
            "let #ident-name : #type-type = #stm-rhs",
            (ctx) => {
                return {
                    "type": "let",
                    "identifier": ctx["ident-name"],
                    "value-type": ctx["type-type"],
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "Export from module",
            "export * from #string-source",
            (ctx) => {
                return {
                    "type": "export-module",
                    "source": ctx["string-source"],
                } satisfies Omit<ExportModuleDeclaration, "span">;
            },
        ),
        new LanguagePattern(
            "Export from module as module",
            "export * as #ident-name from #string-source",
            (ctx) => {
                return {
                    "type": "export-module",
                    "source": ctx["string-source"],
                    "as": ctx["ident-name"],
                } satisfies Omit<ExportModuleDeclaration, "span">;
            },
        ),
        new LanguagePattern(
            "Import all declaration",
            "import * from #string-source",
            (ctx) => {
                return {
                    "type": "import",
                    "scope": "all",
                    "source": ctx["string-source"],
                } satisfies Omit<ImportDeclaration, "span">;
            },
        ),
        new LanguagePattern(
            "Import all as declaration",
            "import * as #ident-as from #string-source",
            (ctx) => {
                return {
                    "type": "import",
                    "scope": "all",
                    "source": ctx["string-source"],
                    "as": ctx["ident-as"],
                } satisfies Omit<ImportDeclaration, "span">;
            },
        ),
        new LanguagePattern(
            "Import selection declaration",
            "import #block-body from #string-source",
            (ctx) => {
                const body = ctx["block-body"];

                const content = new LanguageParser<
                    {
                        "item": IdentifierToken;
                        "as_item"?: IdentifierToken;
                        "span": Span;
                    }
                >(bracketBody(body), [
                    new LanguagePattern(
                        "rename",
                        "#ident-ident as #ident-as",
                        (c) => {
                            return {
                                "item": c["ident-ident"],
                                "as_item": c["ident-as"],
                            };
                        },
                    ),
                    new LanguagePattern("simple", "#ident-ident", (c) => {
                        return {
                            "item": c["ident-ident"],
                        };
                    }),
                ]);
                const list = content.argumentList();

                return {
                    "type": "import",
                    "scope": list.args,
                    "source": ctx["string-source"],
                } satisfies Omit<ImportDeclaration, "span">;
            },
        ),
        new LanguagePattern(
            "Macro and Flag call",
            "#doc-comment-x #stm-body",
            (ctx) => {
                const content = ctx["doc-comment-x"].span.content();
                const doc = new Span(
                    "buffer://",
                    0,
                    13,
                    "documentation",
                    "documentation",
                );
                const str_raw = '"' + content.slice(3) + '"';
                const str = new Span(
                    "buffer://",
                    0,
                    str_raw.length,
                    str_raw,
                    str_raw,
                );
                return {
                    "type": "flag",
                    "flag": {
                        "type": "call",
                        "lhs": {
                            "type": "ident",
                            "ident": {
                                "type": "ident",
                                "span": doc,
                            },
                            "span": doc,
                        },
                        "span": ctx["doc-comment-x"].span,
                        "args": {
                            "type": "args",
                            "args": [
                                {
                                    "type": "string",
                                    "span": str,
                                    "string": {
                                        "type": "string",
                                        "span": str,
                                    },
                                },
                            ],
                        },
                    },
                    "body": ctx["stm-body"],
                } satisfies Omit<FlagStatement, "span">;
            },
        ),
        new LanguagePattern(
            "Macro and Flag call",
            "/ / ! #stm-flag #stm-body",
            (ctx) => {
                return {
                    "type": "flag",
                    "flag": ctx["stm-flag"],
                    "body": ctx["stm-body"],
                };
            },
        ),
        new LanguagePattern(
            "If statement",
            "if #parenthesis-e #block-body",
            (ctx) => {
                const expr = LanguageParser.default(
                    bracketBody(ctx["parenthesis-e"]),
                ).statements();
                if (expr.length != 1) {
                    ctx["parenthesis-e"].span.errorTodo(
                        "Expected only one argument, got " + expr.length,
                    );
                }

                return {
                    "type": "if",
                    "expr": expr[0],
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                    "chainElseIf": undefined,
                    "else": undefined,
                };
            },
        ),
        new LanguagePattern(
            "else if chain",
            "#lh-expr-pre else if #parenthesis-e #block-body",
            (ctx) => {
                //parse the else if arguments
                const pre = ctx["lh-expr-pre"];
                if (pre.type != "if") {
                    return pre.span.errorTodo(
                        "invalid `else if` statement after this",
                    );
                }
                const expr = LanguageParser.default(
                    bracketBody(ctx["parenthesis-e"]),
                ).statements();
                if (expr.length != 1) {
                    ctx["parenthesis-e"].span.errorTodo(
                        "Expected only one argument, got " + expr.length,
                    );
                }
                //find the last link in the chain
                let last_link = pre;
                while (last_link["chainElseIf"] !== undefined) {last_link =
                        last_link["chainElseIf"];}
                //if the last link in the chain was succeeded by an else, throw an error as following that with an conditional is a logical error
                if (last_link.else !== undefined) {
                    pre.span.errorTodo(
                        "cannot be followed by an `else if` as the if chain all ready ended",
                    );
                }
                last_link.chainElseIf = {
                    "type": "if",
                    "chainElseIf": undefined,
                    "else": undefined,
                    "expr": expr[0],
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                    "span": ctx["parenthesis-e"].span.join(
                        ctx["block-body"].span,
                    ),
                };
                return pre;
            },
        ),
        new LanguagePattern(
            "else chain",
            "#lh-expr-pre else #block-body",
            (ctx) => {
                //parse the else if arguments
                const pre = ctx["lh-expr-pre"];
                if (pre.type != "if") {
                    return pre.span.errorTodo(
                        "invalid `else if` statement after this",
                    );
                }
                //find the last link in the chain
                let last_link = pre;
                while (last_link["chainElseIf"] !== undefined) {last_link =
                        last_link["chainElseIf"];}
                //if the last link in the chain was all ready succeeded by an else throw an error
                if (last_link.else !== undefined) {
                    pre.span.errorTodo(
                        "cannot be followed by an `else` as the if chain all ready ended",
                    );
                }
                last_link.else = LanguageParser.default(
                    bracketBody(ctx["block-body"]),
                ).statements();
                return pre;
            },
        ),

        new LanguagePattern(
            "Extension declaration",
            "extension #type-for #block-body",
            (ctx) => {
                return {
                    "type": "extension",
                    "for": ctx["type-for"],
                    "global-type-registry": false,
                    //TODO: implement custom parsing rules for the body
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                };
            },
        ),

        //Global extensions can only be declared in the
        new LanguagePattern(
            "implement declaration",
            "implement #type-for #block-body",
            (ctx) => {
                return {
                    "type": "extension",
                    "for": ctx["type-for"],
                    "global-type-registry": true,
                    //TODO: implement custom parsing rules for the body
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                };
            },
        ),
        new LanguagePattern(
            "Function Declaration",
            "function #ident-name #optional-generics-gen #parenthesis-args : #type-returnType #block-body",
            (ctx) => {
                // console.log("generics",ctx["optional-generics-gen"]);
                const fn: FunctionDeclarationStatement = {
                    "type": "function",
                    "name": ctx["ident-name"],
                    "body": LanguageParser.default(
                        bracketBody(ctx["block-body"]),
                    ).statements(),
                    "args": [],
                    "generics": ctx["optional-generics-gen"],
                    "returnType": ctx["type-returnType"],
                    "span": Span.Empty,
                };
                const tokens = bracketBody(ctx["parenthesis-args"]);
                const parser = LanguageParser.default(tokens);
                while (true) {
                    // console.log("param")
                    const token = parser.next();
                    if (!token) break;
                    if (token.type != "ident") {return token.span
                            .errorUnexpected(["<identifier>"]);}
                    const tokenTypePunct = parser.next();
                    if (!tokenTypePunct) throw new Error("expected token");
                    if (
                        tokenTypePunct.type != "punct" &&
                        tokenTypePunct.span.content() != ":"
                    ) return tokenTypePunct.span.errorUnexpected(["`:`"]);
                    const tt = parser.typeStatement();
                    if (!tt) throw new Error("expected token");
                    fn.args.push({
                        "type": tt,
                        "ident": token,
                    });
                    const tokenTypeEnd = parser.next();
                    if (!parser.peek()) break;
                    if (!tokenTypeEnd) throw new Error("expected token");
                    if (
                        tokenTypeEnd.type != "punct" &&
                        tokenTypeEnd.span?.content() != ","
                    ) return tokenTypeEnd.span.errorUnexpected(["`,`"]);
                }
                // console.log("return");
                return fn;
            },
        ),
        // new LanguagePatternParser("Documentation","/ / / #stm-flag #stm-body",(ctx)=>{
        //     return {
        //         "type":"flag",
        //         "flag":ctx["stm-flag"],
        //         "body":ctx["stm-body"],
        //     }
        // }),
        new LanguagePattern(
            "export flag syntax sugar",
            "export #stm-body",
            (ctx) => {
                return {
                    "type": "flag",
                    "flag": LanguageParser.default(
                        Parser.defaultParser("compiler.export").tokens(),
                    ).statement()!,
                    "body": ctx["stm-body"],
                };
            },
        ),
        new LanguagePattern("return statement", "return #stm-body", (ctx) => {
            return {
                "type": "return",
                "body": ctx["stm-body"],
            };
        }),
        //FIXME: only works with trailing ,
        //TODO: update based on spec
        //TODO: add value types
        new LanguagePattern(
            "Enum Declaration",
            "enum #ident-name #block-content",
            (ctx) => {
                const cases = enumParseCases(ctx["block-content"]);
                const enumValue: EnumDeclarationStatement = {
                    "type": "enum",
                    "cases": cases,
                    "name": ctx["ident-name"],
                    "generics": [],
                    "span": Span.Empty,
                };
                return enumValue;
            },
        ),
        new LanguagePattern(
            "Enum Declaration With generic",
            "enum #ident-name < #ident-generic > #block-content",
            (ctx) => {
                const cases = enumParseCases(ctx["block-content"]);
                const enumValue: EnumDeclarationStatement = {
                    "type": "enum",
                    "cases": cases,
                    "name": ctx["ident-name"],
                    "generics": [
                        ctx["ident-generic"],
                    ],
                    "span": Span.Empty,
                };
                return enumValue;
            },
        ),

        new LanguagePattern(
            "Function Call",
            "#lh-expr-pre #parenthesis-args",
            (ctx) => {
                // console.log("start parse",ctx["parenthesis-args"]);
                return {
                    "type": "call",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "args": LanguageParser.default(
                        bracketBody(ctx["parenthesis-args"]),
                    ).argumentList(),
                };
            },
        ),

        new LanguagePattern(
            "Accessor using a dot",
            "#lh-expr-pre . #ident-name",
            (ctx) => {
                return {
                    "type": "dot",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["ident-name"],
                };
            },
        ),

        new LanguagePattern(
            "Match Statement",
            "match #parenthesis-value #block-content",
            (ctx) => {
                const expr = ctx["parenthesis-value"];
                const args =
                    LanguageParser.default(bracketBody(expr)).argumentList()
                        .args;
                if (args.length > 1) {args[1].span.errorTodo(
                        "matching multiple values this way is disallowed",
                    );}
                if (args.length == 0) {expr.span.errorTodo(
                        "expected a value to match",
                    );}
                const cases = matchParseCases(ctx["block-content"]);
                return {
                    "type": "match",
                    "expr": args[0],
                    "match-cases": cases,
                };
            },
        ),

        //a+b*c in first pass will be treated as (a+b)*c, therefore this rule
        // new LanguagePatternParser("#lh-expr-pre + #stm-mid * #stm-rhs",(ctx)=>{
        //     return {
        //         "type":"math.add",
        //         "lhs":ctx["lh-expr-pre"],
        //         "rhs":ctx["stm-rhs"]
        //     }
        // }),
        new LanguagePattern(
            "range expression starting with int",
            "#int-pre .. #stm-rhs",
            (ctx) => {
                const l = ctx["int-pre"];

                return {
                    "type": "range",
                    "lhs": {
                        "type": "int",
                        "int": l,
                        "span": l.span,
                    },
                    "rhs": ctx["stm-rhs"],
                    "inclusive": false,
                };
            },
        ),

        new LanguagePattern(
            "range expression",
            "#lh-expr-pre .. #stm-rhs",
            (ctx) => {
                return {
                    "type": "range",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                    "inclusive": false,
                };
            },
        ),

        new LanguagePattern(
            "add assign",
            "#lh-expr-pre ..= #stm-rhs",
            (ctx) => {
                return {
                    "type": "range",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                    "inclusive": true,
                };
            },
        ),
        new LanguagePattern("add assign", "#lh-expr-pre += #stm-rhs", (ctx) => {
            return {
                "type": "assign.add",
                "lhs": statement(ctx["lh-expr-pre"]),
                "rhs": ctx["stm-rhs"],
            };
        }),
        new LanguagePattern(
            "add subtract",
            "#lh-expr-pre -= #stm-rhs",
            (ctx) => {
                return {
                    "type": "assign.sub",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "add subtract",
            "#lh-expr-pre *= #stm-rhs",
            (ctx) => {
                return {
                    "type": "assign.mul",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern("Addition", "#lh-expr-pre + #stm-rhs", (ctx) => {
            return {
                "type": "math.add",
                "lhs": statement(ctx["lh-expr-pre"]),
                "rhs": ctx["stm-rhs"],
            };
        }),
        new LanguagePattern(
            "Multiplication",
            "#lh-expr-pre * #stm-rhs",
            (ctx) => {
                const rhs = ctx["stm-rhs"];
                if (rhs.type == "math.add") {
                    return {
                        "type": "math.add",
                        "lhs": {
                            "type": "math.mul",
                            "lhs": statement(ctx["lh-expr-pre"]),
                            "rhs": rhs.lhs,
                        },
                        "rhs": rhs.rhs,
                    };
                } else {
                    return {
                        "type": "math.mul",
                        "lhs": statement(ctx["lh-expr-pre"]),
                        "rhs": ctx["stm-rhs"],
                    };
                }
            },
        ),

        new LanguagePattern("Assign", "#lh-expr-pre = #stm-rhs", (ctx) => {
            return {
                "type": "assign",
                "lhs": ctx["lh-expr-pre"],
                "rhs": ctx["stm-rhs"],
            };
        }),

        new LanguagePattern("String Literal", "#string-a", (ctx) => {
            return {
                "type": "string",
                "string": ctx["string-a"],
            };
        }),
        new LanguagePattern("int Literal", "#int-a", (ctx) => {
            return {
                "type": "int",
                "int": ctx["int-a"],
            };
        }),
        new LanguagePattern("float Literal", "#float-a", (ctx) => {
            return {
                "type": "float",
                "float": ctx["float-a"],
            };
        }),
        new LanguagePattern("Identifier", "#ident-a", (ctx) => {
            //an identifier should not equal a keyword. If that happens there is a structure error somewhere.
            const ident = ctx["ident-a"];
            const id = ident.span.content();
            if (["let", "new", "enum", "function", "return"].includes(id)) {
                ident.span.errorUnexpected(
                    ["<identifier>"],
                    "Expected an <identifier> not a keyword, `" + id +
                        "` is a keyword",
                    "Rename this",
                );
            }
            return {
                "type": "ident",
                "ident": ctx["ident-a"],
            };
        }),
        new LanguagePattern("Scope", "#block-a", (ctx) => {
            return {
                "type": "scope",

                "body": LanguageParser.default(bracketBody(ctx["block-a"]))
                    .statements(),
            };
        }),

        new LanguagePattern(
            "comparison less than",
            "#lh-expr-pre < #stm-rhs",
            (ctx) => {
                return {
                    "type": "cmp.lt",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "comparison less than equal",
            "#lh-expr-pre <= #stm-rhs",
            (ctx) => {
                return {
                    "type": "cmp.lte",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "comparison greater  than ",
            "#lh-expr-pre > #stm-rhs",
            (ctx) => {
                return {
                    "type": "cmp.gt",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "comparison greater  than equal ",
            "#lh-expr-pre >= #stm-rhs",
            (ctx) => {
                return {
                    "type": "cmp.gte",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),

        new LanguagePattern(
            "comparison",
            "#lh-expr-pre = = #stm-rhs",
            (ctx) => {
                return {
                    "type": "cmp",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
        new LanguagePattern(
            "comparison not",
            "#lh-expr-pre ! = #stm-rhs",
            (ctx) => {
                return {
                    "type": "cmp.not",
                    "lhs": statement(ctx["lh-expr-pre"]),
                    "rhs": ctx["stm-rhs"],
                };
            },
        ),
    ];
}

export function matchParseCases(content: BracketToken) {
    let cases: MatchStatement["match-cases"] = [];
    const p = LanguageParser.default(bracketBody(content));
    while (p.position < p.tokens.length) {
        //pattern
        const pattern = p.statement();
        if (pattern == undefined) {
            throw content.span.errorTodo("common error parsing match arms");
        }
        const a = p.next();
        const b = p.next();
        if (a == undefined || b == undefined) {
            throw pattern.span.errorUnexpected(["`=>`"]);
        }
        if (
            a.type != "punct" || b.type != "punct" || a.span.content() != "=" ||
            b.span.content() != ">"
        ) throw a.span.join(b.span).errorTodo("expected `=>`");
        const body = p.statement();
        if (body == undefined) {
            throw b.span.errorTodo("expected a body after the `=>`");
        }
        if (body.type == "scope") {
            cases.push({
                "type": "scoped",
                "pattern": pattern,
                "body": body.body,
            });
        } else {
            cases.push({
                "type": "inline",
                "pattern": pattern,
                "body": body,
            });
        }
        //the next token should be a , or the end of the body
        const comma = p.next();
        if (comma == undefined) break;
        if (comma.type != "punct" || comma.span.content() != ",") {
            comma.span.errorUnexpected(
                ["`,`"],
                "try inserting a `,` before starting a new match case",
            );
        }
    }
    return cases;
}
export function enumParseCases(content: BracketToken) {
    let cases: EnumDeclarationStatement["cases"] = {};
    let usedDiscriminators: number[] = [];
    const p = new LanguageParser(bracketBody(content), [
        new LanguagePattern("Tuple", "#ident-ident #parenthesis-t", (ctx) => {
            const dat = ctx["parenthesis-t"];
            const l = LanguageParser.default(bracketBody(ctx["parenthesis-t"]))
                .typeArgumentList();
            cases[ctx["ident-ident"].span.content()] = {
                "data": {
                    "span": dat.span,
                    "type": "tuple",
                    "types": l,
                },
                "discriminator": NaN,
                "ident": ctx["ident-ident"],
            };
            // dat.span.errorTodo("unexpected, expected tuple or structure")

            return {};
        }),
        new LanguagePattern(
            "Plain with discriminator",
            "#ident-ident = #int-num",
            (ctx) => {
                const d = parseInt(ctx["int-num"].span.content());
                usedDiscriminators.push(d);
                cases[ctx["ident-ident"].span.content()] = {
                    "data": undefined,
                    "discriminator": d,
                    "ident": ctx["ident-ident"],
                };
                return {};
            },
        ),
        new LanguagePattern("Plain", "#ident-ident", (ctx) => {
            cases[ctx["ident-ident"].span.content()] = {
                "data": undefined,
                "discriminator": NaN,
                "ident": ctx["ident-ident"],
            };
            return {};
        }),
    ]);

    p.argumentList();
    let c = 0;
    // console.log(cases);

    for (const key in cases) {
        // console.log(key);
        if (isNaN(cases[key].discriminator)) {
            while (usedDiscriminators.includes(c)) ++c;
            cases[key].discriminator = c;
            c += 1;
        }
    }
    return cases;
}