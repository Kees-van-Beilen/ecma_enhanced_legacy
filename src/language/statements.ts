import { Span } from "../parser/mod.ts";
import {
    FloatLiteralToken,
    IdentifierToken,
    IntLiteralToken,
    StringLiteralToken,
} from "../parser/tokens.ts";
/*

This file defines the datatypes of the parsable statements and a few helper statements

*/


// A few helper functions 
export function typeStatementError(stm: TypeStatement): never {
    if (stm.type == "dot") return typeStatementError(stm.lhs);
    if (stm.type == "tuple") return typeStatementError(stm.types[0]);
    return stm.name.span.errorUnexpected();
}
/// Expect a Statement, throw an error if the object is a TypeStatement
export function statement(stm: Statement | TypeStatement): Statement {
    if (assertStatement(stm)) return stm;
    typeStatementError(stm);
}
/// Expect a TypeStatement, throw an error if the object is a Statement
export function typeStatement(stm: Statement | TypeStatement): TypeStatement {
    if (assertTypeStatement(stm)) return stm;
    throw "";
}
/// Returns a true if the object is a Statement
export function assertStatement(
    stm: Statement | TypeStatement,
): stm is Statement {
    return !assertTypeStatement(stm);
    // return stm?.isType == true
}
/// Returns a true if the object is a TypeStatement
export function assertTypeStatement(
    stm: Statement | TypeStatement,
): stm is TypeStatement {
    return "isType" in stm && stm.isType;
}
/// This is a giant sum-type encapsulating all possible Statements, using the `type` key to discriminate
export type Statement =
    | ExportModuleDeclaration
    | ImportFromTypeDeclaration
    | ImportDeclaration
    | LetStatement
    | IntLiteralStatement
    | FloatLiteralStatement
    | StringLiteralStatement
    | CallStatement
    | IfStatement
    | IdentStatement
    | AccessorOperationStatement
    | GroupStatement
    | AdditionOperationStatement
    | MultiplicationOperationStatement
    | EnumDeclarationStatement
    | FlagStatement
    | ScopeStatement
    | FunctionDeclarationStatement
    | AssignmentStatement
    | ReturnStatement
    | MatchStatement
    | CompareOperationStatement
    | ExtensionDeclarationStatement
    | WhileStatement
    | AdditionAssignStatement
    | SubtractionAssignStatement
    | SubtractionOperationStatement
    | MultiplicationAssignStatement
    | DivisionAssignStatement
    | DivisionOperationStatement
    | NotCompareOperationStatement
    | LessThenOperationStatement
    | LessThenOrEqualOperationStatement
    | GreaterThanOperationStatement
    | GreaterThanOrEqualOperationStatement
    | ForLoop
    | RangeOperationStatement
    | AwaitStatement
    | StructDeclarationStatement
    | StructureDataStatement
    | TraitDeclarationStatement
    | TraitImplementationStatement;
export type IntLiteralStatement = {
    "span": Span;
    "type": "int";
    "int": IntLiteralToken;
};
export type IdentStatement = {
    "span": Span;
    "type": "ident";
    "ident": IdentifierToken;
};
export type FloatLiteralStatement = {
    "span": Span;
    "type": "float";
    "float": FloatLiteralToken;
};
export type StringLiteralStatement = {
    "span": Span;
    "type": "string";
    "string": StringLiteralToken;
};
export type LetStatement = {
    "span": Span;
    "type": "let";
    "identifier": IdentifierToken;
    "value-type": undefined | TypeStatement;
    "rhs": Statement;
};


export type CallStatement = {
    "span": Span;
    "type": "call";
    "lhs": Statement;
    "args": ArgumentList;
};
export type IfStatement = {
    "span": Span;
    "type": "if";
    "expr": Statement;
    "body": Statement[];
    "chainElseIf": IfStatement | undefined;
    "else": Statement[] | undefined;
};
export type AccessorOperationStatement = {
    "span": Span;
    "type": "dot";
    "lhs": Statement;
    "rhs": IdentifierToken;
};
export type GroupStatement = {
    "span": Span;
    "type": "group";
    "group": Statement;
};
export type ScopeStatement = {
    "span": Span;
    "type": "scope";
    "body": Statement[];
};
export type AwaitStatement = {
    "span": Span;
    "type": "await";
    "body": Statement;
};
export type StructureDataStatement = {
    "span": Span;
    "name": TypeStatement;
    "type": "struct-data";
    "properties": Record<
        string,
        { "ident": IdentifierToken; "rhs": Statement }
    >;
};

export type ForLoop = {
    "type": "for";
    "span": Span;
    "body": Statement[];
    "ident": IdentifierToken;
    "expr": Statement;
};

export type RangeOperationStatement = {
    "span": Span;
    "type": "range";
    "lhs": Statement;
    "rhs": Statement;
    "inclusive": boolean;
};

export type AdditionOperationStatement = {
    "span": Span;
    "type": "math.add";
    "lhs": Statement;
    "rhs": Statement;
};
export type SubtractionOperationStatement = {
    "span": Span;
    "type": "math.sub";
    "lhs": Statement;
    "rhs": Statement;
};
export type MultiplicationOperationStatement = {
    "span": Span;
    "type": "math.mul";
    "lhs": Statement;
    "rhs": Statement;
};
export type DivisionOperationStatement = {
    "span": Span;
    "type": "math.div";
    "lhs": Statement;
    "rhs": Statement;
};
export type AssignmentStatement = {
    "span": Span;
    "type": "assign";
    "lhs": Statement;
    "rhs": Statement;
};
export type AdditionAssignStatement = {
    "span": Span;
    "type": "assign.add";
    "lhs": Statement;
    "rhs": Statement;
};
export type SubtractionAssignStatement = {
    "span": Span;
    "type": "assign.sub";
    "lhs": Statement;
    "rhs": Statement;
};
export type MultiplicationAssignStatement = {
    "span": Span;
    "type": "assign.mul";
    "lhs": Statement;
    "rhs": Statement;
};
export type DivisionAssignStatement = {
    "span": Span;
    "type": "assign.div";
    "lhs": Statement;
    "rhs": Statement;
};

export type CompareOperationStatement = {
    "span": Span;
    "type": "cmp";
    "lhs": Statement;
    "rhs": Statement;
};
export type NotCompareOperationStatement = {
    "span": Span;
    "type": "cmp.not";
    "lhs": Statement;
    "rhs": Statement;
};
export type LessThenOperationStatement = {
    "span": Span;
    "type": "cmp.lt";
    "lhs": Statement;
    "rhs": Statement;
};
export type LessThenOrEqualOperationStatement = {
    "span": Span;
    "type": "cmp.lte";
    "lhs": Statement;
    "rhs": Statement;
};
export type GreaterThanOperationStatement = {
    "span": Span;
    "type": "cmp.gt";
    "lhs": Statement;
    "rhs": Statement;
};
export type GreaterThanOrEqualOperationStatement = {
    "span": Span;
    "type": "cmp.gte";
    "lhs": Statement;
    "rhs": Statement;
};

export type FlagStatement = {
    "span": Span;
    "type": "flag";
    "flag": Statement;
    "body": Statement;
};
export type FunctionDeclarationStatement = {
    "span": Span;
    "type": "function";
    "generics": TypeStatement[];
    "name": IdentifierToken;
    "args": { "ident": IdentifierToken; "type": TypeStatement }[];
    "body": Statement[];
    "returnType": TypeStatement;
};
export type ExtensionDeclarationStatement = {
    "span": Span;
    "type": "extension";
    "global-type-registry": boolean;
    "for": TypeStatement;
    "body": Statement[];
};
export type TraitDeclarationStatement = {
    "span": Span;
    "type": "trait";
    "name": IdentifierToken;
    "generics": TypeStatement[];
    "body": Statement[];
};
export type TraitImplementationStatement = {
    "span": Span;
    "type": "impl-trait";
    "trait": TypeStatement;
    "for": TypeStatement;
    "body": Statement[];
};

export type ReturnStatement = {
    "span": Span;
    "type": "return";
    "body": Statement;
};
export type WhileStatement = {
    "span": Span;
    "type": "while";
    "expr": Statement;
    "body": Statement[];
};
export type ImportDeclaration = {
    "type": "import";
    "span": Span;
    "as"?: IdentifierToken;
    "scope": "all" | {
        item: IdentifierToken;
        as_item?: IdentifierToken;
        span: Span;
    }[];
    "source": StringLiteralToken;
};
export type ImportFromTypeDeclaration = {
    "type": "import-from-type";
    "span": Span;
    "scope": { item: IdentifierToken; as_item?: IdentifierToken; span: Span }[];
    "source": IdentifierToken;
};
export type ExportModuleDeclaration = {
    "type": "export-module";
    "span": Span;
    "as"?: IdentifierToken;
    "source": StringLiteralToken;
};
export type MatchStatement = {
    "type": "match";
    "span": Span;
    "expr": Statement;
    "match-cases":
        ({ "type": "inline"; "body": Statement; "pattern": Statement } | {
            "type": "scoped";
            "body": Statement[];
            "pattern": Statement;
        })[];
};

export type ArgumentList = { "type": "args"; "args": Statement[] };

export type TypeStatement =
    & (
        | TypeDefinition
        | TupleType
        | TypeAccessorOperationStatement
        | TypeGenericStatement
    )
    & { "isType": true };
export type TypeAccessorOperationStatement = {
    "span": Span;
    "type": "dot";
    "lhs": TypeStatement;
    "rhs": IdentifierToken;
};
export type TypeDefinition = {
    "span": Span;
    "type": "type";
    "name": IdentifierToken;
};
export type TupleType = {
    "span": Span;
    "type": "tuple";
    "types": TypeStatement[];
};
export type RecordType = {
    "span": Span;
    "type": "record";
    "types": Record<string, TypeDefinition | TupleType>;
};
export type TypeGenericStatement = {
    "span": Span;
    "type": "generic";
    "name": IdentifierToken;
    "generic-value": TypeStatement[];
};

export type EnumDeclarationStatement = {
    "type": "enum";
    "name": IdentifierToken;
    "generics": IdentifierToken[];
    "cases": Record<string, {
        "ident": IdentifierToken;
        "discriminator": number;
        "data": undefined | TupleType | RecordType;
    }>;
    "span": Span;
};
export type StructDeclarationStatement = {
    "type": "struct";
    "name": IdentifierToken;
    "generics": TypeDefinition[];
    "properties": Record<string, {
        "ident": IdentifierToken;
        "type": TypeStatement;
    }>;
    "span": Span;
};

/** Return the Span of the entire statement */
export function statementSpan(stm: Statement | TypeStatement): Span {
    return stm.span;
}

//TODO: Deprecate this function
/**
 * @deprecated
 * @param stm 
 * @param indent 
 * @returns 
 */
export function renderTokenTree(
    _stm: Statement | TypeStatement,
    _$indent = 0,
): string {
    throw new Error(`using deprecated function renderTokenTree`);
    // const i = "   ".repeat(indent);
    // if (assertTypeStatement(stm)) {
    //     return `Type(${stm.span.content()})`;
    // } else {
    //     switch (stm.type) {
    //         case "assign":
    //         case "math.add":
    //         case "math.mul":
    //             return `${stm.type}: \n${i} - lhs: ${
    //                 renderTokenTree(stm.lhs, indent + 1)
    //             }\n${i} - rhs: ${renderTokenTree(stm.rhs, indent + 1)}`;
    //         case "call":
    //             return `${stm.type}: \n${i} - lhs: ${
    //                 renderTokenTree(stm.lhs, indent + 1)
    //             }`;
    //         case "dot":
    //             return `${stm.type} (.${stm.rhs.span.content()}): \n${i} - lhs: ${
    //                 renderTokenTree(stm.lhs, indent + 1)
    //             }`;
    //         case "string":
    //             return `${stm.type}: ${stm.string.span.content()}`;
    //         case "ident":
    //             return `${stm.type}: ${stm.ident.span.content()}`;
    //         case "int":
    //             return `${stm.type}: ${stm.int.span.content()}`;
    //         case "float":
    //             return `${stm.type}: ${stm.float.span.content()}`;

    //         default:
    //             return `[${stm.type}]`;
    //     }
    // }
}
