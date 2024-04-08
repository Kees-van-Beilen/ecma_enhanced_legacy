import { Parser, Span } from "./mod.ts";
export type Token =
    | IntLiteralToken
    | StringLiteralToken
    | FloatLiteralToken
    | PunctuationToken
    | IdentifierToken
    | BracketToken
    | ExpressionPlaceHolderToken
    | IdentifierPlaceHolderToken
    | CommentToken;

export type IntLiteralToken = {
    "type": "int";
    "span": Span;
};
export type StringLiteralToken = {
    "type": "string";
    "span": Span;
};
export type FloatLiteralToken = {
    "type": "float";
    "span": Span;
};
export type PunctuationToken = {
    "type": "punct";
    "span": Span;
};
export type IdentifierToken = {
    "type": "ident";
    "span": Span;
};
export type IdentifierPlaceHolderToken = {
    "type": "placeholder-ident";
    "span": Span;
};
export type ExpressionPlaceHolderToken = {
    "type": "placeholder-expr";
    "span": Span;
};
export type BracketToken = {
    "type": "bracket";
    "span": Span;
};
export type CommentToken = {
    "type": "comment";
    "span": Span;
};
/**
 * Returns a array of tokens the reside in the body
 */
export function bracketBody(bracket: BracketToken): Token[] {
    const p = Parser.defaultParser(bracket.span.content().slice(1, -1));
    p.fileName = bracket.span.file;
    p.mayorSource = bracket.span._source;
    p.mayorSourceOffset = bracket.span.start + 1;
    return p.tokens();
}
