import { CompilationCluster } from "./module.ts";
import { Span } from "./src/parser/span.ts";

//command line interface for ee
if (Deno.args.length == 0) {
    console.log(`usage: Deno run -A ./cli.ts [OPTIONS] file`);
    console.log(`Options:\n\t--trace: enable js stacktraces\n\t--no-std: do not include a standard library\n\t--emit: only emit the javascript to the terminal\n\t--list-exports: List the exports of a module\n\t--list-types: List the types of a module\n\t--ast: print the abstract syntax tree to the console as JSON`);
    Deno.exit();
}
let compilationFlags = {
    //include js stack trace in compiler error
    "--trace": false,
    //Do not include the stdlib
    "--no-std": false,
    //emit js the the terminal
    "--emit": false,
    "--list-exports": false,
    "--list-types": false,
    "--ast": false,
};
let std_lib_path = "";
let next_is_lib = false;
for (const arg of Deno.args) {
    if(next_is_lib){
        std_lib_path = arg;
        next_is_lib=false;
        continue;
    }
    if (arg.startsWith("-")) {
        if (arg in compilationFlags) {
            //@ts-ignore ts fucked up
            compilationFlags[arg] = true;
            continue;
        }else if(arg=="--lib"){
            next_is_lib=true;
            continue;
        }
        throw `unknown flag: ${arg}`;
    } else {
        if (compilationFlags["--trace"]) {
            Span.ErrorHandler = () => {
                throw new Error("stack trace");
            };
        }
        //run the program
        const cluster = new CompilationCluster(
            compilationFlags["--no-std"]?undefined: await Deno.realPath(
                std_lib_path,
            ),
        );
        // Span.ErrorHandler = ()=>{throw "recover"};

        const main = cluster.addModule(
            "main",
            arg,
            !compilationFlags["--no-std"],
        );
        if (compilationFlags["--ast"]) {
            console.log(JSON.stringify(main.statements));
        }
        if (compilationFlags["--list-exports"]) {
            console.log(main.getAllExports());
            Deno.exit();
        }
        const code = cluster.compile();
        if (compilationFlags["--emit"]) {
            console.log(code);
        } else {
            eval(code);
        }
    }
}
