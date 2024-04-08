//lightweight lsp for EcmaEnhanced

import { CompilationCluster, Module } from "./module.ts";
// import { readLines } from "https://deno.land/std@0.217.0/io/buffer.ts";
import { readline } from "https://deno.land/x/readline@v1.1.0/mod.ts";
import { Parser } from "./src/parser/mod.ts";
import { EEType, Scope } from "./compile.ts";
import { Span } from "./src/parser/span.ts";
import { Statement } from "./src/language/statements.ts";
// const r = readline(Deno.stdin);

const std_lib:undefined|string = undefined;



const decoder = new TextDecoder();
Span.ErrorHandler = () => {
    throw "";
};

//{"action":"hover","pos":54,"text":"enum A {\n    Do,\n    Dont\n}\nconsole.log(10);\nconsole.log(A.Do);\n\n\n\n\n","uri":"/Users/kbeilen/Desktop/homework/coding/ecma_enhanced_tests/e.ee"}
function getStm(pos: number, mod: Statement[]): Statement | undefined {
    let inRange = (stm: { "span": Span }) =>
        stm.span.start <= pos && pos <= stm.span.end();
    for (const stm of mod) {
        if (!inRange(stm)) continue;
        //check if the statement has nesting
        if (
            stm.type == "assign" || stm.type == "math.add" ||
            stm.type == "math.mul"
        ) return getStm(pos, [stm.lhs, stm.rhs]);
        if (stm.type == "dot") {
            //if the left side is within hover than return that token
            if (inRange(stm.lhs)) return stm.lhs;
            if (inRange(stm.rhs)) return stm;
            return undefined;
            //return getStm(pos,[stm.lhs,{"type":"ident","ident":stm.rhs,"span":stm.rhs.span}]);
        }
        if (stm.type == "let") {
            // if(stm["value-type"]&&inRange(stm["value-type"]))
            if (inRange(stm.identifier)) {
                return {
                    "type": "ident",
                    "ident": stm.identifier,
                    "span": stm.identifier.span,
                };
            }
            if (inRange(stm.rhs)) return getStm(pos, [stm.rhs]);
            return undefined;
        }
        if (stm.type == "call") return getStm(pos, [stm.lhs, ...stm.args.args]);
        // console.log(stm.type);
        // if(stm.type=="enum")return getStm(pos,stm)
        if (stm.type == "flag") return getStm(pos, [stm.body]) ?? stm;
        if (stm.type == "group") return getStm(pos, [stm.group]);
        if (stm.type == "scope") return getStm(pos, stm.body);
        if (stm.type == "function") return getStm(pos, stm.body);
        return stm;
        // return stm;
    }
}
function stmDocInfo(stm: Statement, mod: Module) {
    const ty = mod.scope.resolveType(stm);
    if ("doc" in ty && ty.doc) return ty.doc;
    return "No documentation available";
}
function m(ls: Record<string, EEType>) {
    return Object.entries(ls).map(([label, val]) => {
        let kind = VSCodeCompletionItemKind.Text;
        if (val.type == "enumValue") kind = VSCodeCompletionItemKind.EnumMember;
        if (val.type == "builtin") kind = VSCodeCompletionItemKind.Value;
        if (val.type == "enum") kind = VSCodeCompletionItemKind.Enum;
        if (val.type == "fn") kind = VSCodeCompletionItemKind.Function;
        if (val.type == "module") kind = VSCodeCompletionItemKind.Module;
        // if(val.type=="")kind=VSCodeCompletionItemKind.Module;
        return {
            "label": label,
            "documentation": "doc" in val
                ? val.doc
                : "No documentation available",
            "kind": kind,
        };
    });
}



const c = new CompilationCluster(
    std_lib,
);
//{"action":"completion","pos":64,"text":"\nconsole.log(10);\nconsole.log(Option.Some(\"string\"));\n\nconsole.l\n\n\n\n\n\n\n\n","uri":"/Users/kbeilen/Desktop/homework/coding/ecma_enhanced_tests/e.ee"}
for await (const line of readline(Deno.stdin)) {
    const text = decoder.decode(line);
    const req = JSON.parse(text);
    if (req.action == "completion") {
        let source: string = req.text;
        const url = req.uri;
        const pos = req.pos;
        let view_members = false;
        if (source[pos - 1] == ".") {
            //insert a phony character
            source = source.slice(0, pos) + "m" + source.slice(pos);
            // console.log(source);
            view_members = true;
        }
        try {
            //adding the new module will fail probally because of the tokeniser state
            const main = c.addOrReplaceModuleText(
                "main",
                url,
                source,
                true,
                false,
            );
            //this operation will fail but leave a partially initialised module
            try {
                main.scope.init(main.statements);
            } catch {}
            const stm = getStm(pos, main.statements);
            // console.log(stm);

            if (stm?.type == "dot") {
                const ls = main.scope.getMemberList(stm.lhs);
                const rt = m(ls);

                console.log(JSON.stringify(rt));
            } else if (stm?.type == "ident") {
                //complete the identifier
                //TODO: implement scoping rules
                const rt = m(main.scope.getRootMemberList());
                console.log(JSON.stringify(rt));
            } else {
                console.log(JSON.stringify([]));
            }
            if (!stm) throw "abort";
            // {"label":"","documentation":"","kind"}
        } catch (e) {
            console.log(
                JSON.stringify({ "abort": true, "msg": e.message ?? e }),
            );
            // if(e=="abort"){
            //     console.log(JSON.stringify({"abort":true,"msg":e.message??e}));
            // }else{
            //     //we got here because of an unexpected token. Probally a .
            //     // if(source[pos-1]!=)
            //     // console.log(source[pos-1])
            // }
            // const mod = c.resolveModule(url,true);
            // // console.log(mod);
            // const stm = getStm(pos,mod.statements);
            // console.log(mod.statements[0].span._source);
        }
    }
    if (req.action == "hover") {
        const source = req.text;
        const url = req.uri;
        const pos = req.pos;
        try {
            const main = c.addOrReplaceModuleText("main", url, source, true);
            const stm = getStm(pos, main.statements);
            if (!stm) throw "no statement fount";
            const i = stmDocInfo(stm, main);
            console.log(JSON.stringify({
                "content": i,
                "start": stm.span.start,
                "dbg": stm.type,
                "len": stm.span.len,
            }));
            // console.log("{\"abort\":true}");
        } catch (e) {
            console.log(JSON.stringify({ "abort": true, "msg": e }));
        }
    }
    if (req.action == "semantics") {
        const source = req.text;
        const url = req.uri;
        //try the new module
        try {
            // const c = new CompilationCluster("/Users/kbeilen/Desktop/homework/coding/code-reaper/std/mod.ee");
            const main = c.addOrReplaceModuleText("main", url, source, true);
            // const s = new Scope()
            // s.init()
            //{"action":"semantics","text":"console.log(\"hello world\")","uri":"/Users/kbeilen/Desktop/homework/coding/code-reaper/out.dbg"}
            const ret = main.statements.map((b) => {
                function tok(token: { "span": Span }, t: string) {
                    return {
                        "start": token.span.start,
                        "len": token.span.len,
                        "type": t,
                    };
                }
                //{"action":"semantics","text":"enum console.log(\"hello world\");\n","uri":"/Users/kbeilen/Desktop/homework/coding/ecma_enhanced_tests/e.ee"}
                function sem(token: typeof b, def = "comment"): unknown {
                    let type = def;
                    if (
                        token.type == "math.add" || token.type == "math.mul" ||
                        token.type == "assign"
                    ) {
                        return [sem(token.lhs), sem(token.rhs)];
                    } else if (token.type == "call") {
                        return [
                            sem(token.lhs, "function"),
                            ...token.args.args.map((e) => sem(e)),
                        ];
                    } else if (token.type == "dot") {
                        return [
                            sem(token.lhs),
                            tok(
                                token.rhs,
                                def == "function" ? "function" : "property",
                            ),
                        ];
                    } else if (token.type == "enum") {
                        return [
                            tok(token.name, "enum"),
                            ...token.generics.map((e) =>
                                tok(e, "typeParameter")
                            ),
                            ...Object.values(token.cases).flatMap((e) => {
                                if (e.data && e.data.type == "tuple") {
                                    return [
                                        tok(e.ident, "enumMember"),
                                        //TODO: implement a semantic type analyser in the scope class
                                        ...e.data.types.map((e) =>
                                            tok(e, "type")
                                        ),
                                    ];
                                } else {
                                    return tok(e.ident, "enumMember");
                                }
                            }),
                        ];
                    } else if (token.type == "ident") {
                        //get the underlying value of the ident
                        const ty = main.scope.getTypeOfName(token);
                        type = "variable";
                        if (ty.type == "fn") type = "function";
                        if (ty.type == "enum") type = "enum";
                        if (ty.type == "enumValue") type = "enumMember";
                        if (ty.type == "module") type = "namespace";
                        // if(ty.type == "")type="module";
                    } else if (token.type == "string") {
                        type = "string";
                    } else if (token.type == "int" || token.type == "float") {
                        type = "number";
                    } else if (token.type == "group") {
                        return sem(token.group);
                    } else if (token.type == "flag" || token.type == "return") {
                        return sem(token.body);
                    } else if (token.type == "let") {
                        return token["value-type"]
                            ? [
                                tok(token.identifier, "variable"),
                                tok(token["value-type"], "type"),
                                sem(token.rhs),
                            ]
                            : [
                                tok(token.identifier, "variable"),
                                sem(token.rhs),
                            ];
                    } else if (token.type == "function") {
                        return [
                            tok(token.name, "function"),
                            ...token.args.flatMap(
                                (e) => [
                                    tok(e.ident, "parameter"),
                                    tok(e.type, "type"),
                                ]
                            ),
                            tok(token.returnType, "type"),
                            ...token.body.flatMap((e) => sem(e)),
                        ];
                    } else if (token.type == "scope") {
                        return token.body.flatMap((e) => sem(e));
                    }
                    return tok(token, type);
                }
                return sem(b);
            }).flat(1000);
            console.log(JSON.stringify(ret));
        } catch {
            console.log('{"abort":true}');
        }
    }
    // console.log(line);
}

export const enum VSCodeCompletionItemKind {
    /**
     * The `Text` completion item kind.
     */
    Text = 0,
    /**
     * The `Method` completion item kind.
     */
    Method = 1,
    /**
     * The `Function` completion item kind.
     */
    Function = 2,
    /**
     * The `Constructor` completion item kind.
     */
    Constructor = 3,
    /**
     * The `Field` completion item kind.
     */
    Field = 4,
    /**
     * The `Variable` completion item kind.
     */
    Variable = 5,
    /**
     * The `Class` completion item kind.
     */
    Class = 6,
    /**
     * The `Interface` completion item kind.
     */
    Interface = 7,
    /**
     * The `Module` completion item kind.
     */
    Module = 8,
    /**
     * The `Property` completion item kind.
     */
    Property = 9,
    /**
     * The `Unit` completion item kind.
     */
    Unit = 10,
    /**
     * The `Value` completion item kind.
     */
    Value = 11,
    /**
     * The `Enum` completion item kind.
     */
    Enum = 12,
    /**
     * The `Keyword` completion item kind.
     */
    Keyword = 13,
    /**
     * The `Snippet` completion item kind.
     */
    Snippet = 14,
    /**
     * The `Color` completion item kind.
     */
    Color = 15,
    /**
     * The `Reference` completion item kind.
     */
    Reference = 17,
    /**
     * The `File` completion item kind.
     */
    File = 16,
    /**
     * The `Folder` completion item kind.
     */
    Folder = 18,
    /**
     * The `EnumMember` completion item kind.
     */
    EnumMember = 19,
    /**
     * The `Constant` completion item kind.
     */
    Constant = 20,
    /**
     * The `Struct` completion item kind.
     */
    Struct = 21,
    /**
     * The `Event` completion item kind.
     */
    Event = 22,
    /**
     * The `Operator` completion item kind.
     */
    Operator = 23,
    /**
     * The `TypeParameter` completion item kind.
     */
    TypeParameter = 24,
    /**
     * The `User` completion item kind.
     */
    User = 25,
    /**
     * The `Issue` completion item kind.
     */
    Issue = 26,
}

// const source = new CompilationCluster("/Users/kbeilen/Desktop/homework/coding/code-reaper/std/");

// function error(msg:string,code:number=InternalError){
//     return {"code":code,"message":msg};
// }

// async function complete(params:{
//     "textDocument":{
//         "uri": string;
//     },
//     "position":{
//         //including 0
//         "line":number,
//         //including 0
//         "character":number
//     },
//     "context":{
//         "triggerKind":number,
//         "triggerCharacter"?:string
//     }
// }){
//     //firstly check and or compile the module
//     const mod = source.resolveModule(params.textDocument.uri,true);
//     //translate line/character to nth character
//     let char = 0;
//     const file_buffer = mod.statements[0].span._source;
//     for(let i=0;i<params.position.line;++i)char = file_buffer.indexOf("\n",char);
//     char+=params.position.character;
//     //find a token with span range that includes char
//     for(const stm of mod.statements){
//         if(!(stm.span.start <= char && char <= stm.span.end()))continue;
//         if(stm.type == "ident"){
//             //return a list of identifiers
//             return Object.keys(mod.scope.types).map(e=>{
//                 return {
//                     "label":e,
//                     /*
//                     	export const Text = 1;
// 	export const Method = 2;
// 	export const Function = 3;
// 	export const Constructor = 4;
// 	export const Field = 5;
// 	export const Variable = 6;
// 	export const Class = 7;
// 	export const Interface = 8;
// 	export const Module = 9;
// 	export const Property = 10;
// 	export const Unit = 11;
// 	export const Value = 12;
// 	export const Enum = 13;
// 	export const Keyword = 14;
// 	export const Snippet = 15;
// 	export const Color = 16;
// 	export const File = 17;
// 	export const Reference = 18;
// 	export const Folder = 19;
// 	export const EnumMember = 20;
// 	export const Constant = 21;
// 	export const Struct = 22;
// 	export const Event = 23;
// 	export const Operator = 24;
// 	export const TypeParameter = 25;
//     */
//                     //@ts-ignore d
//                     "kind":{"builtin":6,"enum":13,"enumValue":13,"fn":3,"module":9,"valueGeneric":25}[mod.scope.types[e].type=="withGenerics"?mod.scope.types[e].value:mod.scope.types[e].type]

//                 }
//             })

//         }
//         break;
//     }
// }
// function init(params:{}):unknown{
//     return {
//         "capabilities":{
//             "completionProvider":{
//                 "triggerCharacters":[".",],
//                 "resolveProvider":true,
//                 "completionItem":{
//                     "labelDetailsSupport":true,
//                 }

//             },
//             "documentHighlightProvider":false,
//         },
//         "serverInfo":{
//             "name":"ecma-enhanced lsp-lite",
//             "version":"1.0.0"
//         }
//     }
// }
// // const line = readline(reader);

// export const ParseError: number = -32700;
// export const InvalidRequest: number = -32600;
// export const MethodNotFound: number = -32601;
// export const InvalidParams: number = -32602;
// export const InternalError: number = -32603;

// /**
//  * This is the start range of JSON-RPC reserved error codes.
//  * It doesn't denote a real error code. No LSP error codes should
//  * be defined between the start and end range. For backwards
//  * compatibility the `ServerNotInitialized` and the `UnknownErrorCode`
//  * are left in the range.
//  *
//  * @since 3.16.0
//  */
// export const jsonrpcReservedErrorRangeStart: number = -32099;
// /** @deprecated use jsonrpcReservedErrorRangeStart */
// export const serverErrorStart: number = jsonrpcReservedErrorRangeStart;

// /**
//  * Error code indicating that a server received a notification or
//  * request before the server has received the `initialize` request.
//  */
// export const ServerNotInitialized: number = -32002;
// export const UnknownErrorCode: number = -32001;

// /**
//  * This is the end range of JSON-RPC reserved error codes.
//  * It doesn't denote a real error code.
//  *
//  * @since 3.16.0
//  */
// export const jsonrpcReservedErrorRangeEnd = -32000;
// /** @deprecated use jsonrpcReservedErrorRangeEnd */
// export const serverErrorEnd: number = jsonrpcReservedErrorRangeEnd;

// /**
//  * This is the start range of LSP reserved error codes.
//  * It doesn't denote a real error code.
//  *
//  * @since 3.16.0
//  */
// export const lspReservedErrorRangeStart: number = -32899;

// /**
//  * A request failed but it was syntactically correct, e.g the
//  * method name was known and the parameters were valid. The error
//  * message should contain human readable information about why
//  * the request failed.
//  *
//  * @since 3.17.0
//  */
// export const RequestFailed: number = -32803;

// /**
//  * The server cancelled the request. This error code should
//  * only be used for requests that explicitly support being
//  * server cancellable.
//  *
//  * @since 3.17.0
//  */
// export const ServerCancelled: number = -32802;

// /**
//  * The server detected that the content of a document got
//  * modified outside normal conditions. A server should
//  * NOT send this error code if it detects a content change
//  * in it unprocessed messages. The result even computed
//  * on an older state might still be useful for the client.
//  *
//  * If a client decides that a result is not of any use anymore
//  * the client should cancel the request.
//  */
// export const ContentModified: number = -32801;

// /**
//  * The client has canceled a request and a server as detected
//  * the cancel.
//  */
// export const RequestCancelled: number = -32800;

// /**
//  * This is the end range of LSP reserved error codes.
//  * It doesn't denote a real error code.
//  *
//  * @since 3.16.0
//  */
// export const lspReservedErrorRangeEnd: number = -32800;
