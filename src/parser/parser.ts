import { Span, Token } from "./mod.ts";
import { ParserPattern } from "./pattern.ts";

export class Parser {
    public static Pattern = ParserPattern;
    public fileName = "::buffer";
    public source: string;
    public mayorSource: string;
    public mayorSourceOffset = 0;
    public position = 0;
    public parserPatterns: ParserPattern[];

    private contextPositionStart = 0;
    private contextPositionStartBuffer: number[] = [];

    public startContext() {
        this.contextPositionStartBuffer.push(this.position);
        this.contextPositionStart = this.position;
    }
    public endContext(): Span {
        this.contextPositionStart = this.contextPositionStartBuffer.pop() ??
            this.position;
        return new Span(
            this.fileName,
            this.contextPositionStart + this.mayorSourceOffset,
            this.position - this.contextPositionStart,
            this.source.slice(this.contextPositionStart, this.position),
            this.mayorSource,
        );
    }

    public consumeWhiteSpace() {
        while (" \t\n".includes(this.peek() ?? "a")) {
            this.position++;
        }
    }

    public next(): string | undefined {
        if (this.position >= this.source.length) return undefined;
        return this.source[this.position++];
    }
    public peek(ahead = 0): string | undefined {
        if (this.position + ahead >= this.source.length) return undefined;
        return this.source[this.position + ahead];
    }

    public nextToken(): Token | undefined {
        for (const pattern of this.parserPatterns) {
            const token = pattern.parse(this);
            if (token) return token;
            this.position = this.contextPositionStartBuffer.pop() ??
                this.position;
        }
        return undefined;
    }

    public tokens(): Token[] {
        const body = [];
        while (true) {
            const t = this.nextToken();
            if (!t) break;
            body.push(t);
        }
        return body;
    }

    constructor(source: string, patterns: ParserPattern[]) {
        this.source = source;
        this.parserPatterns = patterns;
        this.mayorSource = source;
    }

    public static defaultParser(source: string): Parser {
        const patterns = Parser.defaultPatterns;
        return new Parser(source, patterns);
    }

    public static defaultPatterns = [
        new ParserPattern(
            '"',
            "",
            (s) => {
                return { "type": "string", "span": s };
            },
            (parser) => {
                while (parser.peek() != '"') {
                    const t = parser.next();
                    if (t == '"') {
                        parser.next();
                    }
                    if (t == undefined) return false;
                }
                ++parser.position;
                return true;
            },
        ),
        (new ParserPattern(
            "0123456789",
            "0123456789.",
            (e) => {
                if (e.content().includes(".")) {
                    return { "type": "float", "span": e };
                } else {
                    return { "type": "int", "span": e };
                }
            },
        )).endImmediatelyBefore(".."),
        new ParserPattern(
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_",
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789",
            (s) => {
                return { "type": "ident", "span": s };
            },
        ),
        new ParserPattern(
            "({[",
            "",
            (s) => {
                //bracket validation
                const c = s.content();
                const opening = c.at(0);
                const expectClosing =
                    { "[": "]", "{": "}", "(": ")" }[opening ?? "???"] ?? "???";
                if (expectClosing != c.at(-1)) {
                    console.log(s, s.slice(-1));
                    //incorrect bracket ending
                    // const pair = {"[":"]","{":"}","(":")"}[c.at(0)??"???"]??"???";
                    s.slice(-1).errorUnexpected(
                        [`\`${expectClosing}\``],
                        undefined,
                        `Insert a closing \`${expectClosing}\` bracket before using any other brackets`,
                        () => {
                            s.slice(0, 1).lineHighlight(
                                "Opening bracket here",
                                undefined,
                                2,
                                true,
                                true,
                                Span.Color.BRIGHT_YELLOW,
                            );
                        },
                        true,
                    );
                }
                return { "type": "bracket", "span": s };
            },
            (parser) => {
                while (true) {
                    parser.consumeWhiteSpace();
                    // console.log("pp",parser.peek(),parser.contextPositionStartBuffer);
                    if (")}]".includes(parser.peek() ?? "\0")) {
                        parser.next();
                        return true;
                    }
                    if (parser.nextToken() == undefined) return false;
                }
            },
        ),
        new ParserPattern("/", "", (s) => {
            return { "type": "comment", "span": s };
        }, (parser: Parser) => {
            if (parser.peek() != "/") return false;
            if (parser.peek(1) == "!") return false;
            while (parser.peek() != "\n") ++parser.position;
            return true;
        }),
        new ParserPattern(
            undefined,
            "",
            (s) => {
                //some character cannot appear as punctuation as they would incicate a structural error
                const id = s.content();
                if ("({[".includes(id)) {
                    s.errorUnexpected(
                        undefined,
                        undefined,
                        `Remove the \`${id}\` or insert a closing \`${
                            { "(": ")", "{": "}", "[": "]" }[id]
                        }\` after it`,
                    );
                }
                if ("]})".includes(id)) {
                    s.errorUnexpected(
                        undefined,
                        undefined,
                        `Remove the \`${id}\` or insert a opening \`${
                            { ")": "(", "}": "{", "]": "[" }[id]
                        }\` before it`,
                    );
                }
                return { "type": "punct", "span": s };
            },
            (parser) => parser.next() !== undefined,
        ),
    ];
}
