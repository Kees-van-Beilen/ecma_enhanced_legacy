// export type Token = (IntLiteralToken|StringLiteralToken|FloatLiteralToken|PunctuationToken|IdentifierToken|BracketToken|ExpressionPlaceHolderToken|IdentifierPlaceHolderToken);

// export type IntLiteralToken = {
//     "type":"int",
//     "span":Span
// }
// export type StringLiteralToken = {
//     "type":"string",
//     "span":Span
// }
// export type FloatLiteralToken = {
//     "type":"float",
//     "span":Span
// }
// export type PunctuationToken = {
//     "type":"punct",
//     "span":Span
// }
// export type IdentifierToken = {
//     "type":"ident",
//     "span":Span
// }
// export type IdentifierPlaceHolderToken = {
//     "type":"placeholder-ident",
//     "span":Span
// }
// export type ExpressionPlaceHolderToken = {
//     "type":"placeholder-expr",
//     "span":Span
// }
// export type BracketToken = {
//     "type":"bracket",
//     "span":Span
// }

// export function bracketBody(bracket:BracketToken):Token[]{
//     const p = Parser.defaultParser(bracket.span.content().slice(1,-1));
//     p.mayorSource = bracket.span._source;
//     p.mayorSourceOffset=bracket.span.start+1;
//     return p.tokens();
   
// }
// export class ParserPattern{
//     public firstCharacter:string|undefined;
//     public charset:string;
//     public customParser: ((parser:Parser)=>boolean)|undefined;
//     public factory:(str:Span)=>Token|undefined;

//     public parse(parser:Parser):Token|undefined{
//         parser.consumeWhiteSpace();
//         parser.startContext();
//         if(this.firstCharacter && !this.firstCharacter.includes(parser.peek()??"\0"))return undefined;
//         // console.log(this.firstCharacter,parser.position);
//         if(this.firstCharacter)++parser.position
//         if(this.customParser){
//             if(!this.customParser(parser))return undefined;
//         }else{
//             while(this.charset.includes(parser.peek()??"\0")){
//                 ++parser.position;
//             }
//         }
//         const span = parser.endContext();
//         return this.factory(span);
//     }
//     constructor(firstCharacter:string|undefined,charset:string,factory:typeof  ParserPattern.prototype.factory,customParser?:typeof ParserPattern.prototype.customParser){
//         this.charset=charset;
//         // this.ignoreFirstChaRule=ignoreFirstChaRule;
//         this.firstCharacter=firstCharacter;
//         this.customParser=customParser;
//         this.factory=factory;
//     }
// }
// export class Span {
//     public readonly file:string;
//     public readonly start:number;
//     public readonly len:number;
//     //must exist as refrence to the file string
//     public readonly _content:string;
//     public readonly _source:string;

//     constructor(file:string,start:number,len:number,content:string,source:string){
//         this.file=file;
//         this.start=start;
//         this.len=len;
//         this._content=content
//         this._source=source
//     }

//     public content():string{
//         return this._content;
//     }

//     public errorUnexpected(valid:string[]=[]):never{
//         console.error(`\x1B[101mERROR\x1B[0m\x1B[1m: Unexpected token \`${this._content}\` \x1B[0m`);
//         console.error();
//         let ln = 1;
//         let l = 0;
//         let b = 0;
//         for(let i=0;i<this.start;++i){
//             if(this._source[i]=="\n"){
//                 ln+=1;
//                 b=0;
//                 l+=b;
//             }else{
//                 b+=1;
//             }
//         }
//         const col = b;
//         const lines = this._source.split("\n");
//         const ctx = lines.slice(Math.max(ln-3,0),Math.max(ln,0)).map((e,i)=>{
//             if(i==2){
//                 return `\x1B[34m${(i-2+ln)} |\x1B[0m ${e.slice(0,col)}\x1B[91m${e.slice(col,col+this.len)}\x1B[0m${e.slice(col+this.len)}`
//             }else{
//                 return `\x1B[34m${(i-2+ln)} |\x1B[0m ${e}`
//             }
//         }).join("\n");
//         const msg = "This token is unexpected";
//         console.error(`   \x1B[34m\x1B[4m/ ${this.file}:${ln}:${col} ${" ".repeat(col+msg.length-this.file.length)}\x1B[0m\x1B[34m/\x1B[0m`)
//         console.error(`  \x1B[34m|\x1B[0m`);
//         console.error(ctx);
//         console.error(`  \x1B[34m|\x1B[0m ${" ".repeat(col)}\x1B[91m${"^".repeat(this.len)} ${msg}\x1B[0m`)
//         console.error(`  \x1B[34m|\x1B[4m ${" ".repeat(col+msg.length+8)}\x1B[0m`);
//         // console.error(` \x1B[34m\x1B[4m/ help ${" ".repeat(col+msg.length+4)}\x1B[0m`);
        
//         if(valid.length>0){
//             const helpMsg = `The following tokens would be accepted: \n${valid.map(e=>` - ${e}`).join("\n")}`;
//             const msg = helpMsg.split("\n").map(e=>`  \x1B[34m= \x1B[0m\x1B[1mhelp:\x1B[0m\x1B[2m ${e}\x1B[0m`).join("\n");
//             console.error(msg);
//             // console.error(`  \x1B[34m= \x1B[0m\x1B[1mhelp:\x1B[0m\x1B[2m help message`);
//         }
//         // console.error(`whilst ${whilst}`)
//         Deno.exit(1);
//     }
// }

// export class Parser{
//     public fileName="::buffer"
//     public source:string;
//     public mayorSource:string;
//     public mayorSourceOffset=0
//     public position=0;
//     public parserPatterns:ParserPattern[];

//     private contextPositionStart=0;
//     private contextPositionStartBuffer:number[]=[];

//     public startContext(){
//         this.contextPositionStartBuffer.push(this.position);
//         this.contextPositionStart=this.position;
//         // console.log("start ctx",this.contextPositionStart,this.position)
//     }
//     public endContext():Span{
//         this.contextPositionStart=this.contextPositionStartBuffer.pop()??this.position;
//         return new Span(
//             this.fileName,
//             this.contextPositionStart+this.mayorSourceOffset,
//             this.position-this.contextPositionStart,
//             this.source.slice(this.contextPositionStart,this.position),
//             this.mayorSource
//         )
//     }

//     consumeWhiteSpace(){
//         while(" \t\n".includes(this.peek()??"a")){
//             this.position++
//         }
//     }

//     next():string|undefined{
//         if(this.position >= this.source.length)return undefined;
//         return this.source[this.position++]
//     }
//     peek():string|undefined {
//         if(this.position >= this.source.length)return undefined;
//         return this.source[this.position]
//     }

//     public nextToken():Token|undefined{
//         for(const pattern  of this.parserPatterns){
//             const token = pattern.parse(this);
//             // console.log(this.position,this.contextPositionStart);
//             if(token)return token;
//             this.position=this.contextPositionStartBuffer.pop()??this.position;
//         }
//         return undefined
//     }

//     public tokens():Token[]{
//         let body = [];
//         while(true){
//             let t = this.nextToken();;
//             if(!t)break;
//             body.push(t);
//         }
//         return body;
//     }

//     constructor(source:string,patterns:ParserPattern[]){
//         this.source=source;
//         this.parserPatterns=patterns;
//         this.mayorSource=source;
//     }

//     public static defaultPatterns = 
//          [
//             new ParserPattern(
//                 "\"",
//                 "",
//                 (s)=>{return {"type":"string","span":s}},
//                 (parser)=>{
//                     while(parser.peek()!="\""){
//                         const t = parser.next();
//                         if(t=="\""){
//                             parser.next();
//                         }
//                         if(t==undefined)return false;
//                     }
//                     ++parser.position;
//                     return true;
//                 }
//             ),
//             new ParserPattern(
//                 "0123456789",
//                 "0123456789.",
//                 (e)=>{
//                     if(e.content().includes(".")){
//                         return {"type":"float","span":e};
//                     }else{
//                         return {"type":"int","span":e};
//                     }
//                 }
//             ),
//             new ParserPattern(
//                 "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
//                 "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789",
//                 (s)=>{return {"type":"ident","span":s}},
//             ),
//             new ParserPattern(
//                 "({[",
//                 "",
//                 (s)=>{return {"type":"bracket","span":s}},
//                 (parser)=>{
//                     while(true){
//                         parser.consumeWhiteSpace();
//                         // console.log("pp",parser.peek(),parser.contextPositionStartBuffer);
//                         if(")}]".includes(parser.peek()??"\0")){
//                             parser.next()
//                             return true;
//                         }
//                         if(parser.nextToken()==undefined)return false;
//                     }
//                 }
//             ),
//             new ParserPattern(
//                 undefined,"",(s)=>{return {"type":"punct","span":s}},
//                 (parser)=>parser.next() !== undefined
//             )
//         ];

//     public static defaultParser(source:string):Parser{
        
//         const patterns = Parser.defaultPatterns;
//         return new Parser(source,patterns);
//     }
// }