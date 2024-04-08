import { EEType, GlobalImplementationRegistry, Scope, compileStatements } from "./compile.ts";
import { LanguageParser } from "./src/language/mod.ts";
import { Statement } from "./src/language/statements.ts";
import { Parser } from "./src/parser/parser.ts";
import { IdentifierToken } from "./src/parser/tokens.ts";

export class Module{

    public readonly absolutePath:string;
    public readonly absoluteDir:string;
    public readonly name:string;
    public readonly with_std:boolean;


    public statements:Statement[];
    public scope:Scope;
    public cluster:CompilationCluster;


    constructor(name:string,fromPath:string,cluster:CompilationCluster,with_std:boolean,global:GlobalImplementationRegistry,overwrite_content?:string,init=true){
        this.cluster=cluster;
        this.name=name;
        this.with_std=with_std;
        this.absolutePath = Deno.realPathSync(fromPath);
        this.absoluteDir = this.absolutePath.split("/").slice(0,-1).join("/")+"/";
        const file   = typeof overwrite_content == "string" ? overwrite_content : Deno.readTextFileSync(this.absolutePath);
        const tokens = new Parser(file,Parser.defaultPatterns);
        tokens.fileName = this.absolutePath;
        // console.log(tokens.fileName);
        const languageParser = new LanguageParser(tokens.tokens(),LanguageParser.defaultPatterns);
        this.statements = languageParser.statements();
        // console.log("n");
        // console.log(this.statements);
        this.scope = new Scope(global);
        this.scope.module = this;
        this.scope.name = name;
        this.scope.isModuleTop=true;
        if(init)this.scope.init(this.statements);
    }

    public pathRelativeToThisModule(path:string){
        if(path.startsWith("/")){
            return path;
        }else{
            return this.absoluteDir + path;
        }
    }

    public importModule(path:string):Module{
        // if()
        return this.cluster.resolveModule(this.pathRelativeToThisModule(path),path==this.cluster.std_lib?false:this.with_std);
    }

    public getExport(ident:IdentifierToken){
        const str = ident.span.content();
        const fn = this.scope.functions[str];
        if(fn){
            if(!fn.flag.export){
                ident.span.errorUnexpected(undefined,"trying to import a private item","try adding `export` before the function",()=>{
                    ident.span.lineHighlight("This function is private","~");
                });
            }
            return {"type":"fn","fn":fn,"name":str};
        }
        const ty = this.scope.exportTypes[ident.span.content()];
        if(ty){
            return ty;
        }

    }
    public getAllExports(){
        let ls:({"type":"type","value":EEType,"name":string}|{"type":"extension","extension":Scope["extensions"][string],"name":string})[] = [];
        for(const name in this.scope.functions){
            const fn = this.scope.functions[name];
            if(fn.flag.export){
                ls.push({"type":"type","value":{"type":"fn","fn":fn,"doc":fn.flag.doc,"associative":true},"name":name});
            }
        }
        for(const name in this.scope.extensions){
            const ext = this.scope.extensions[name];
            // console.log("ext",ext);
            if(!ext.export)continue;
            // console.log("push");
            ls.push({"type":"extension","extension":ext,"name":name});
        }
        // console.log(ls);
        for(const name in this.scope.exportTypes){
            const ty = this.scope.exportTypes[name];
            ls.push({"type":"type","value":ty,"name":name});
        }
        return ls;
    }
    
}

///Keep tracks of modules etc..
export class CompilationCluster{
    private modules:Record<string,Module> = {};
    private global:GlobalImplementationRegistry;

    public compilation_settings = {
        "panic_handler_js":"throw new Error()",
    }
    public readonly std_lib?:string;
    constructor(std_lib?:string){
        this.std_lib = std_lib;
        this.global = new GlobalImplementationRegistry();
    }
    public resolveModule(path:string,with_std:boolean){
        const p = Deno.realPathSync(path);
        // console.log("resolve",p);
        if(this.modules[p])return this.modules[p];
        return this.addModule(path,p,with_std);
    }
    public addModule(name:string,fromPath:string,with_std:boolean){
        const m = new Module(name,fromPath,this,with_std,this.global);
        this.modules[m.absolutePath]=m;
        return m;
    }
    public addOrReplaceModuleText(name:string,path:string,source:string,with_std:boolean,init?:boolean){
        const m = new Module(name,path,this,with_std,this.global,source,init);
        this.modules[m.absolutePath]=m;
        return m;
    }

    public compile():string{
        let final = "";
        final += this.global.compile();
        //compile all files and join them
        for(const name in this.modules){
            const mod = this.modules[name];
            const t = compileStatements(mod.statements,mod.scope);
            final+=t;
        }
        return final;
    }
}
