import { Parser, Span, Token } from "../parser/mod.ts";
import {
    LangContext,
    LanguageParser,
    Statement,
    TypeStatement,
} from "./mod.ts";

/*

This file defines the pattern matcher. Used to 

*/

const patterns = [
    new Parser.Pattern(
        "#",
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
        (s) => {
            return { "type": "placeholder-ident", "span": s };
        },
    ),
    new Parser.Pattern(
        "%",
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
        (s) => {
            return { "type": "placeholder-expr", "span": s };
        },
    ),
    ...(Parser.defaultPatterns),
];

export class LanguagePattern<T extends { "span": Span }> {
    public pattern: Token[] = [];
    public static Patterns = patterns;
    public name: string;
    public factory: (context: LangContext) => Omit<T, "span">;
    constructor(
        name: string,
        pattern: string,
        factory: (context: LangContext) => Omit<T, "span">,
    ) {
        // console.log(pattern);
        this.name = name;
        const tokens = (new Parser(pattern, patterns)).tokens();
        this.pattern = tokens;
        this.factory = factory;
        // console.log(tokens);
    }

    public compareToken(a: Token, b: Token, ctx: LangContext) {
        // if(a)
        // a.
        switch (a.type) {
            case "ident":
            case "int":
            case "punct":
            case "string":
            case "float": {
                return a.type == b.type && a.span.content() == b.span.content();
            }
            case "placeholder-ident": {
                const id = a.span.content().slice(1);
                const short = id.split("-").pop();
                // console.log(id);
                if (id.startsWith("int-")) {
                    if (b.type == "int") {
                        ctx[`int-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                } else if (id.startsWith("float-")) {
                    if (b.type == "float") {
                        ctx[`float-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                } else if (id.startsWith("doc-comment-")) {
                    if (
                        b.type == "comment" && b.span._content.startsWith("///")
                    ) {
                        ctx[`doc-comment-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                } else if (id.startsWith("ident-")) {
                    if (b.type == "ident") {
                        ctx[`ident-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                } else if (id.startsWith("string-")) {
                    if (b.type == "string") {
                        ctx[`string-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                } else if (id.startsWith("expr-")) {
                    return false;
                } else if (id.startsWith("block-")) {
                    // console.log("body check")
                    if (
                        b.type == "bracket" && b.span.content().startsWith("{")
                    ) {
                        ctx[`block-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                } else if (id.startsWith("parenthesis-")) {
                    if (
                        b.type == "bracket" && b.span.content().startsWith("(")
                    ) {
                        ctx[`parenthesis-${short}`] = b;
                        return true;
                    } else {
                        return false;
                    }
                }
            }
        }
        return false;
    }
    public match(
        parser: LanguageParser<T>,
        lhExpr: T | undefined,
    ): T | undefined {
        parser.startContext();
        const context: LangContext = {};
        let carriedExpression = false;

        for (let i = 0; i < this.pattern.length; ++i) {
            const token = this.pattern[i];
            // console.log(token.type);
            // if(this.name== "Function Declaration")console.log(i,token);
            const t = parser.next();
            // console.log(i,lhExpr,carriedExpression);
            // if(carriedExpression)console.log("carry t",token,t,i,parser,context);
            if (i != 0 && lhExpr && !carriedExpression) return undefined;
            if (!t) return undefined;
            if (token.type == "placeholder-ident") {
                const id = token.span.content();
                const short = id.split("-").pop();
                // console.log(id);
                if (id.startsWith("#lh-expr-") && i == 0 && lhExpr) {
                    //carry over the lefthandExpression
                    --parser.position;
                    carriedExpression = true;
                    //@ts-ignore
                    context[`lh-expr-${short}`] = lhExpr;
                    continue;
                }
                if (id.startsWith("#expr-")) {
                    const until = this.pattern[i + 1];
                    const body: Token[] = [t];
                    while (true) {
                        const b = parser.next();
                        // console.log("dsds",b);
                        if (until == undefined && b == undefined) break;
                        if (b == undefined) return undefined;
                        if (this.compareToken(until, b, context)) break;
                        body.push(b);
                    }
                    context[`expr-${short}`] = body;
                    i += 1;
                    continue;
                } else if (id.startsWith("#stm-")) {
                    --parser.position;
                    const s = parser.statement();
                    if (!s) return undefined;
                    //@ts-ignore
                    context[`stm-${short}`] = s;
                    continue;
                } else if (id.startsWith("#type-")) {
                    --parser.position;
                    const s = parser.typeStatement();
                    // console.log(s);
                    if (!s) return undefined;
                    context[`type-${short}`] = s;
                    continue;
                } else if (id.startsWith("#optional-generics-")) {
                    //parse a generic type
                    // console.log("optional generics")
                    const s = t;
                    if (s?.type != "punct" || s.span.content() != "<") {
                        //rollback
                        --parser.position;
                        context[`optional-generics-${short}`] = [];
                        continue;
                    }
                    const a = parser.typeArgumentList();
                    const c = parser.next();
                    if (c?.type != "punct" || c.span.content() != ">") {
                        parser.position -= 2;
                        context[`optional-generics-${short}`] = [];
                        continue;
                    }
                    // console.log("success optional generic");
                    context[`optional-generics-${short}`] = a;
                    // console.log("genric",context);
                    continue;
                }
            }
            if (!this.compareToken(token, t, context)) return undefined;
        }
        if (lhExpr && !carriedExpression) return undefined;
        // console.log("p end")
        let span = parser.endContext();
        if (carriedExpression && lhExpr) span = lhExpr.span.join(span);
        // if(this.name=="Function Declaration")console.log("csdkkpdsdsk",context);
        let rtn = this.factory(context);
        // if(this.name=="Function Declaration")console.log("context rtn",rtn);

        //@ts-ignore
        rtn.span = span;
        // if(this.name=="Function Declaration")console.log("context rtn",rtn);
        //@ts-ignore
        return rtn;
        // return context;
    }
}
