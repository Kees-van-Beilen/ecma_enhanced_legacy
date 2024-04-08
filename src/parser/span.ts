// A
const C = {
    "RESET": "\x1B[0m",
    "BG_RED": "\x1B[101m",
    "BLUE": "\x1B[34m",
    "BRIGHT_RED": "\x1b[91m",
    "BRIGHT_YELLOW": "\x1b[93m",
    "BOLD": "\x1B[1m",
    "UNDERLINE": "\x1B[4m",
    "FADED": "\x1B[2m",
    s: (str: string, ...styles: string[]) =>
        `${styles.join("")}${str}${C.RESET}`,
};

export class Explainer {
    public readonly n: number;
    public readonly explanation: string;
    public readonly example?: string;
    public readonly conclusion?: string;
    constructor(
        n: number,
        explanation: string,
        example?: string,
        conclusion?: string,
    ) {
        this.n = n;
        this.explanation = explanation.trim().replaceAll("\t", "").replaceAll(
            / +/g,
            " ",
        );
        this.example = example?.trim().replaceAll("\t", "").replaceAll(
            / +/g,
            " ",
        );
        this.conclusion = conclusion?.trim().replaceAll("\t", "").replaceAll(
            / +/g,
            " ",
        );
    }

    public static get IncorrectTypeInLetAssignment(): Explainer {
        return new Explainer(
            1,
            `
            The assigned value's type doesn't match the written type in a let statement. For example:
        `,
            `
            let a:int = 1.0 //error
        `,
            `
            The written type of a let statement must match the assigned value's type.
        `,
        );
    }
    public static get IncorrectRightHandTypeInAssignment(): Explainer {
        return new Explainer(
            2,
            `
            The assigned value's type doesn't match the of the variable it's assigned to. For example:
        `,
            `
            let a:int = 1
            a = 1.0 //error
        `,
            `
            The assigned value's type must match the type of the assignee.
        `,
        );
    }
}
export class Span {
    public static Color = C;
    public readonly file: string;
    public readonly start: number;
    public readonly len: number;
    public static ErrorHandler: () => never = () => Deno.exit(1);
    //must exist as reference to the file string
    public readonly _content: string;
    public readonly _source: string;

    constructor(
        file: string,
        start: number,
        len: number,
        content: string,
        source: string,
    ) {
        this.file = file;
        this.start = start;
        this.len = len;
        this._content = content;
        this._source = source;
    }

    public static Empty = new Span("temp", 0, 0, "", "");

    public end(): number {
        return this.start + this.len;
    }

    public join(rhs: Span): Span {
        const start = Math.min(rhs.start, this.start);
        const end = Math.max(rhs.end(), this.end());
        const s = this._source.slice(start, end);
        return new Span(
            this.file,
            start,
            end - start,
            s,
            this._source,
        );
    }

    public slice(start: number, end?: number): Span {
        if (!end) end = this.len;
        if (end < 0) end = this.len + end;
        if (start < 0) start = this.len + start;
        return new Span(
            this.file,
            this.start + start,
            end - start,
            this._content.slice(start, end),
            this._source,
        );
    }

    public content(): string {
        return this._content;
    }

    private lineInfo() {
        let ln = 1;
        let l = 0;
        let b = 0;
        for (let i = 0; i < this.start; ++i) {
            if (this._source[i] == "\n") {
                ln += 1;
                b = 0;
                l += b;
            } else {
                b += 1;
            }
        }
        const col = b;
        return {
            "lineNumber": ln,
            "column": col,
        };
    }
    ///prints a line preview and highlight this span with message to stderr and return [lineNumber,column]
    public lineHighlight(
        msg: string,
        highlightChar = "^",
        lineAmount = 3,
        header = true,
        fileSplit = false,
        highlightColor = C.BRIGHT_RED,
    ) {
        const info = this.lineInfo();
        const lines = this._source.split("\n");
        const padLnLength = info.lineNumber.toString().length;
        const firstLineThis = this._content.split("\n")[0];
        const ctx = lines.slice(
            Math.max(info.lineNumber - lineAmount, 0),
            Math.max(info.lineNumber, 0),
        ).map((e, i) => {
            const prefix = C.s(
                `${
                    (Math.max(1, i - lineAmount + 1 + info.lineNumber))
                        .toString().padStart(padLnLength, " ")
                } | `,
                C.BLUE,
            );
            if (i == lineAmount - 1) {
                return ` ${prefix} ${e.slice(0, info.column)}${highlightColor}${
                    e.slice(info.column, info.column + firstLineThis.length)
                }\x1B[0m${e.slice(info.column + firstLineThis.length)}`;
            } else {
                return ` ${prefix} ${e}`;
            }
        }).join("\n");
        const prefix = C.s(` ${"".padStart(padLnLength, " ")} | `, C.BLUE);
        if (header) {
            console.error(
                `${
                    "".padStart(padLnLength + 3, " ")
                }\x1B[34m\x1B[4m/ ${this.file}:${info.lineNumber}:${info.column} ${
                    " ".repeat(
                        info.column +
                            Math.max(msg.length - this.file.length, 0),
                    )
                }\x1B[0m\x1B[34m/\x1B[0m`,
            );
        }
        console.error(ctx);
        console.error(
            `${prefix} ${" ".repeat(info.column)}${highlightColor}${
                highlightChar.repeat(firstLineThis.length)
            } ${msg}\x1B[0m`,
        );
        console.error(
            `${prefix} ${" ".repeat(info.column + msg.length + 8)}\x1B[0m`,
        );
        if (fileSplit) {
            console.error(
                `${C.BLUE} ${"".padStart(padLnLength, " ")}   ${
                    "~".repeat(info.column + msg.length + 8)
                }\x1B[0m`,
            );
        }
    }
    private helpMessage(msg: string) {
        const info = this.lineInfo();
        const prefix = C.s(
            ` ${"".padStart(info.lineNumber.toString().length, " ")} ? `,
            C.BLUE,
        );
        const msgE = msg.split("\n").map((e) =>
            `${prefix}\x1B[1mhelp:\x1B[0m\x1B[2m ${e}\x1B[0m`
        ).join("\n");
        console.error(msgE);
    }
    private hintMessage(msg: string) {
        const info = this.lineInfo();
        const prefix = C.s(
            ` ${"".padStart(info.lineNumber.toString().length, " ")} = `,
            C.BLUE,
        );
        const msgE = msg.split("\n").map((e) =>
            `${prefix}\x1B[1mhint:\x1B[0m\x1B[2m ${e}\x1B[0m`
        ).join("\n");
        console.error(msgE);
    }
    private explain(explainer: Explainer, width = 70) {
        const info = this.lineInfo();
        const prefix = ` ${
            "".padStart(info.lineNumber.toString().length, " ")
        }   `;
        const dashPrefix = ` ${
            "".padStart(info.lineNumber.toString().length, " ")
        } ${C.BLUE}|${C.RESET} `;
        const shortPrefix = ` ${
            "".padStart(info.lineNumber.toString().length, " ")
        } `;
        const splitWords = (str: string) => {
            const w = str.split(" ");
            let i = 0;
            let line = "";
            const lines = [];
            while (i < w.length) {
                line += w[i];
                line += " ";
                i += 1;
                if (
                    line.length + (w[i]?.length ?? 0) >
                        (lines.length == 0 ? width - 5 : width + 1)
                ) {
                    lines.push(line);

                    line = "";
                }
            }
            lines.push(line);
            return lines;
        };
        const splitWordsComplete = (str: string) => {
            return str.split("\n").flatMap((e) => splitWords(e));
        };
        // console.log(splitWords(explainer.explanation))
        // console.log("explainer")
        console.error(dashPrefix);
        console.error(
            splitWordsComplete(explainer.explanation).map((e, i) =>
                i == 0
                    ? `${shortPrefix}${
                        C.s(
                            `[E${explainer.n.toString().padStart(4, "0")}] `,
                            C.BOLD,
                            C.BLUE,
                        )
                    }${C.FADED}${e}`
                    : `${prefix}${e}`
            ).join("\n"),
        );
        if (explainer.example) {
            console.error();
            console.error(
                splitWordsComplete(explainer.example).map((e) =>
                    `${prefix}${e}`
                ).join("\n"),
            );
            console.error();
        }
        if (explainer.conclusion) {
            console.error(
                splitWordsComplete(explainer.conclusion).map((e) =>
                    `${prefix}${e}`
                ).join("\n"),
            );
        }
        console.error(C.RESET);
    }

    public errorTodo(info?: string): never {
        console.error(
            `\x1B[101mERROR\x1B[0m\x1B[1m: Encounter a Todo  \x1B[0m\n`,
        );
        this.lineHighlight(`Todo: ${info}`);
        Span.ErrorHandler();
    }

    public incorrectType<A extends true | false | undefined>(
        goodType?: string,
        explainer?: Explainer,
        overwriteBadType?: string,
        fatal?: A,
    ): A extends (undefined | true) ? never : undefined {
        this.error(`Incorrect type \`${overwriteBadType ?? this._content}\``);
        this.lineHighlight("This type is incorrect");
        if (goodType) this.hintMessage(`Did you mean \`${goodType}\`?`);
        if (explainer) this.explain(explainer, 50);
        // if(fatal==true)Span.ErrorHandler();
        //@ts-ignore dear ts, please let this just be
        return (fatal ?? true) ? Span.ErrorHandler() : undefined;
    }

    public error(title: string) {
        console.error(`\x1B[101mERROR\x1B[0m\x1B[1m: ${title} \x1B[0m\n`);
    }
    public errorUnexpected(
        valid: string[] = [],
        help?: string,
        hint?: string,
        extra?: () => void,
        omitHeader = false,
    ): never {
        let title = this._content;
        if (title.length > 20) {
            title = `${title.slice(0, 7)}...${title.slice(-7)}`;
        }
        this.error(`Unexpected token \`${title}\``);
        // console.error(`\x1B[101mERROR\x1B[0m\x1B[1m: Unexpected token \`${title}\` \x1B[0m\n`);
        if (extra) extra();
        this.lineHighlight("This token is unexpected", "^", 3, !omitHeader);
        if (hint) this.hintMessage(hint);
        if (help) this.helpMessage(help);
        if (valid.length > 0) {
            const helpMsg = `The following tokens would be accepted: \n${
                valid.map((e) => ` - ${e}`).join("\n")
            }`;
            this.helpMessage(helpMsg);
        }
        // Deno.exit(1);
        Span.ErrorHandler();
    }
}
