# Ecma Enhanced
This is the proof of concept ecma-enhanced language. A type-safe programming languages that transpiles to JavaScript. A full implementation is currently being written in Rust. This project was made as part of my IT-finals project. To run or compile files, Deno is required.
Please follow the [up to date instructions ](https://docs.deno.com/runtime/manual/getting_started/installation) on how to install Deno.

Installing the command line interface:
```bash
deno install -A -n eec ./cli.ts
```
or install from the repo
```bash
deno install -A -n eec https://raw.githubusercontent.com/Kees-van-Beilen/ecma_enhanced_legacy/1d31632d15ad81128a188bb1f25936fd41ba3ef8/cli.ts
```

Running a file:
```bash
eec --lib ./std/mod.ee ./tests/05.loop.ee
```
The `--lib` argument sets the standard library path. This is a module that is imported in every file it's equivalent to adding `import * from "/path/to/stdlib/mod.ee"` at the top of every file. If no standard library is used, pass the argument `--no-std` to `eec`.


An overview of some of the syntax inside ecma enhanced can be found at [Language Design.pdf](./Language%20design.pdf). Not all of the syntax described in that snippet has been implemented and some syntax is missing from that document. A quick overview of most of the language features:
```rust
/// 52 bit integer
let an_age:int = 19;
/// 64 bit float
let y:float = 0.1;
///structured data
struct Person {
    name: string,
    age: int
}
///function definition
function print_name(of_person: Person):void{

    console.log("name of person:", of_person.name);
}
///Note the type of the object is always named when constructing the object
let a_person = Person {
    name:"A name",
    age: an_age
}
/// Mentioning the object type is helpful when constructing objects as part of a function argument.
print_name(Person {
    name: "My name",
    age: 1
});
///Every type can be extended using extensions, creating associative functions
extension Person {
    function greet(self:Person,times:int):void{
        for(i in 0..times) {
            console.log("Hello",self.name);
        }
    }
}

///The self argument is automatically passed to associative functions. 
a_person.greet(10);

///Enums can contain data
enum Color {
    Red,
    Green,
    Blue,
    Hex(string)
}

///Implementation are like extensions but globally availably.
implement Color {
    function hex(self:Color):string {
        let return_value = "";
        match(self){
            Color.Red => {
                return_value = "#ff0000";
            },
            Color.Green => {
                return_value = "#00ff00";
            },
            Color.Blue => {
                return_value = "#0000ff";
            },
            Color.Hex(hex_str) => {
                return_value = hex_str;
            }
        }
        return return_value;
    }
}

let my_color1 = Color.Red;
let my_color2 = Color.Green;
let my_color3 = Color.Blue;
let my_color4 = Color.Hex("#ffffff");
let my_color5 = Color.Hex("#000000");
/// Enums use tuples when necessary for data representation
console.log(my_color1);
console.log(my_color2);
console.log(my_color3);
console.log(my_color4);
console.log(my_color5);

console.log(my_color1.hex());
console.log(my_color2.hex());
console.log(my_color3.hex());
console.log(my_color4.hex());
console.log(my_color5.hex());
///continuously loop
loop {
    let maybe_name = prompt("What's your name");
    match(maybe_name){
        Option.Some(name) => {
            console.log("That's the end of this showcase,",name);
            panic("");
        },
        Option.None => {
            console.log("Please provide an name");
        }
    }
}
```
This file can be ran using 
```sh
eec --lib ./std/mod.ee lang.ee
```


There also is a small language server, that requires some manual setup to get working. If you want to use the language server, then in `lsp-lite.ts` set `const std_lib:undefined|string` equal to the absolute path of your `./std/mod.ee` file. Afterwards, in `vscode-extension/ecmaenhanced/index.js` modify `const lsp_abs_path = "/path/to/lsp-lite.ts";` to point to the absolute path of `lsp-lite.ts`.


