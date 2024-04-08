// import * as code from "vscode";
const lsp_abs_path = "/path/to/lsp-lite.ts";
const { spawn } = require("child_process");
const code = require("vscode");
const server = require("vscode-languageclient/node.js");
const channel = code.window.createOutputChannel("Ecma Enhanced Debug");
channel.appendLine("init");
// code.window.showInformationMessage("hello world");

function wait(ms){
    return new Promise((res)=>{
        setTimeout(res,ms);
    })
}
/**
 * 
 * @param {code.ExtensionContext} context 
 */
module.exports.activate =  function(context) {
    channel.appendLine("activate"+context.storageUri.path);


    //create proccess
    const proc = spawn("deno",["run","-A",lsp_abs_path],{"stdio":"pipe"});
    proc.stdout.setEncoding("utf8");
    proc.stderr.setEncoding("utf8");
    async function get(){
        let total = "";
        channel.appendLine("sdc cmd: "+proc.stdout.readable);
        while(true){
            const chunk = proc.stdout.read();
            if(chunk==null){
                const s = proc.stderr.read();
                // channel.appendLine("std err: "+s);
                s == null;
                //wait 
                await wait(50);
                continue
            }
            // channel.appendLine("read chunk "+chunk);
            total+=chunk;
            // channel.appendLine("read chunk "+chunk.endsWith("\n"));
            if(chunk.endsWith("\n"))break;
        }
        channel.appendLine("recievec cmd: "+total);
        return JSON.parse(total);
    }

    let q = {};
    function exe_next_cmd(){
        // channel.appendLine("execute next cmd");
        if(Object.keys(q).length==0)return;
        for(const v of Object.values(q)){
            // channel.appendLine("active: " + v.active);
            if(v.active)return 
        }
        const t = Object.keys(q)[0];
        const a = q[t];
        a.active=true;
        const m = JSON.stringify(a.message)+"\n";
        channel.appendLine("send cmd: "+m);
        proc.stdin.cork();
        proc.stdin.write(m,(err)=>{
            if(err)channel.appendLine(err.message);
        });
        process.nextTick(() => {
            // channel.appendLine("uncork");
            proc.stdin.uncork();
            get().then((b)=>{
                delete q[t];
                process.nextTick(() => {exe_next_cmd()})
                a.res(b);
            })
        });
    }
    function cmd(args){
        return new Promise((res,rej)=>{
            const d = args.action;
            if(d in q){
                //cancel the previous op
                //reject current task if the q task is active
                if(q.active)return rej();
                q.rej();
            }
            q[d] = {
                "active":false,
                "rej":rej,
                "res":res,
                "message":args
            };
            exe_next_cmd();
            // proc.stdin.uncork();

        })
    }

    proc.addListener("error",(e)=>{
        channel.appendLine("error spawning language server");
        channel.appendLine(e.message);

    });
    proc.addListener("exit",(e)=>{
        channel.appendLine("langserver exit with status "+e);

    })
    proc.addListener("close",(e)=>{
        channel.appendLine("langserver closed with status "+e);

    })

    proc.addListener("spawn",()=>{
        const selector = {"language":"ecmaenhanced"};
        channel.appendLine("attaching ls lite");
        const legend = {
            "tokenModifiers":["declaration","definition"],
            "tokenTypes":[
                "function","property","typeParameter","enum","enumMember","type","variable","string","number","comment","parameter","namespace"
            ]
        };

        // code.languages.register
        code.languages.registerCompletionItemProvider(selector,{
            "provideCompletionItems":async (doc,pos,token,context)=>{
                // context.triggerCharacter
                channel.appendLine("completion trigger by: "+context.triggerCharacter);
                const res =  await cmd({"action":"completion","pos":doc.offsetAt(pos),"text":doc.getText(),"uri":doc.uri.path});
                if(res?.abort===true)throw "abort";``
                return {
                    "items":res,
                }
            },
        },..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.");

        code.languages.registerHoverProvider(selector,{
            "provideHover":async (doc,pos,token)=>{
                const res =  await cmd({"action":"hover","pos":doc.offsetAt(pos),"text":doc.getText(),"uri":doc.uri.path});
                if(res?.abort===true)throw "abort";
                // return  new code.Hover(res.content);
                // channel.appendLine("range "+(res.start+res.len))
                return  new code.Hover(res.content,new code.Range(doc.positionAt(res.start),doc.positionAt(res.start+res.len)));
            }
        })
        // code.languages.register
        code.languages.registerDocumentSemanticTokensProvider(selector,{
            "provideDocumentSemanticTokens":async (doc,token)=>{
                // channel.appendLine("generating semantics");
                const builder = new code.SemanticTokensBuilder(legend);
                const res = await cmd({"action":"semantics","text":doc.getText(),"uri":doc.uri.path});
                // channel.appendLine("got result: "+res);
                if(res?.abort===true){
                    //somthing in the semantics went wrong
                    throw "abort";
                }
                // channel.appendLine("start build ");
                for(const item of res){
                    try {
                        const start = doc.positionAt(item.start);
                        const end = doc.positionAt(item.start+item.len);
                        const range = new code.Range(start,end);
                        builder.push(range,item.type,["declaration"])
                    }catch(e){
                        channel.appendLine("build err: " + e);
                        channel.appendLine("build for: " + JSON.stringify(item));

                    }
                    
                }
                // channel.appendLine("end build ");
                const r = builder.build();
                // channel.appendLine("write: "+r.data);
                // console.log(r);
                return r;
            }
        },legend)
        // code.languages.registerColorProvider({"language":"ecmaenhanced"},{
        //     "provideDocumentColors":(doc)=>{
        //         return [
        //             {"color":code.SyntaxTokenType}
        //         ]
        //     },
        //     "provideColorPresentations":(color,context,token)=>{
        //         return [{""}]
        //     }
        // })
        // code.languages.registerDocumentHighlightProvider({
        //     "language":"ecmaenhanced",
        // },{
        //     "provideDocumentHighlights":(doc,position,token)=>{
        //         //the position doesn't matter, just define all the highlighting for a given file
        //         // const pos = doc.offsetAt(position)
        //         const t = cmd({"method":"highlights","text":doc.getText()})
        //         return [
        //             new code.DocumentHighlight().kind document.high
        //         ]
        //         // position
        //     }
        // })
    })
    // /** @type {server.ServerOptions} */
    // const serverOptions = {
	// 	// run: { module: serverModule, transport: TransportKind.ipc },
	// 	// debug: {
	// 	// 	module: serverModule,
	// 	// 	transport: TransportKind.ipc,
	// 	// },
    //     "command":"deno",
    //     "args":["run","-A","/Users/kbeilen/Desktop/homework/coding/code-reaper/lsp-lite.ts"],
    //     "transport":server.TransportKind.stdio,
	// };

	// // Options to control the language client
    //  /** @type {server.LanguageClientOptions} */
	// const clientOptions = {
	// 	// Register the server for plain text documents
	// 	documentSelector: [{ scheme: 'file', language: 'ecmaenhance' }],
	// 	synchronize: {
	// 		// Notify the server about file changes to '.clientrc files contained in the workspace
	// 		fileEvents: code.workspace.createFileSystemWatcher('**/.ee')
	// 	}
	// };


    // const client = new server.LanguageClient(
    //     'EcmaEnhancedLanguageServer',
	// 	'EcmaEnhanced Language Server',
	// 	serverOptions,
	// 	clientOptions
    // );
    // client.start();
}


module.exports.deactivate =  function deactivate() {
	if (!client) {
		return undefined;
	}
    channel.appendLine("deactivate");

	return client.stop();
}