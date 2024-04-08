/*
This module is used for parsing text into computer readable tokens. Using a unbuffered (=nested tokens are parsed recursively instead of begin buffered) forwards (=the entire file is parsed once) stack (=The parser uses a stack to keep track of state) parser
*/

export * from "./parser.ts";
export * from "./pattern.ts";
export * from "./tokens.ts";
export * from "./span.ts"