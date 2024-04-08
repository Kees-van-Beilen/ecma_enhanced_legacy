import { Parser, Span, Token } from "./mod.ts";
export class ParserPattern {
    public firstCharacter: string | undefined;
    public charset: string;
    public endImmediately?: string;
    public customParser: ((parser: Parser) => boolean) | undefined;
    public factory: (str: Span) => Token | undefined;

    public parse(parser: Parser): Token | undefined {
        parser.consumeWhiteSpace();
        parser.startContext();
        if (
            this.firstCharacter &&
            !this.firstCharacter.includes(parser.peek() ?? "\0")
        ) return undefined;
        // console.log(this.firstCharacter,parser.position);
        if (this.firstCharacter) ++parser.position;
        if (this.customParser) {
            if (!this.customParser(parser)) return undefined;
        } else {
            while (this.charset.includes(parser.peek() ?? "\0")) {
                if (this.endImmediately) {
                    const t = parser.source.slice(
                        parser.position,
                        parser.position + this.endImmediately.length,
                    );
                    // console.log(t==this.endImmediately);
                    if (t == this.endImmediately) break;
                }
                ++parser.position;
            }
        }
        const span = parser.endContext();
        // if(this.endImmediately)console.log(span.content());
        return this.factory(span);
    }
    constructor(
        firstCharacter: string | undefined,
        charset: string,
        factory: typeof ParserPattern.prototype.factory,
        customParser?: typeof ParserPattern.prototype.customParser,
    ) {
        this.charset = charset;
        // this.ignoreFirstChaRule=ignoreFirstChaRule;
        this.firstCharacter = firstCharacter;
        this.customParser = customParser;
        this.factory = factory;
    }
    public endImmediatelyBefore(match: string) {
        this.endImmediately = match;
        return this;
    }
}
