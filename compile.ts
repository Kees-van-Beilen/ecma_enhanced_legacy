import { Module } from "./module.ts";
import {
    IdentStatement,
    Statement,
    TypeStatement,
} from "./src/language/mod.ts";
import {
    AwaitStatement,
    CallStatement,
    FunctionDeclarationStatement,
    StructDeclarationStatement,
    StructureDataStatement,
    TupleType,
} from "./src/language/statements.ts";
import { IdentifierToken, Span } from "./src/parser/mod.ts";
import { Explainer } from "./src/parser/span.ts";

export type EEType =
    | EEBuiltinType
    | EEEnumType
    | EEEnumValueType
    | EECallImplementer
    | EEModuleType
    | EEWithGenerics
    | EEGenericType
    | EEStructType;
type EEEnumType = {
    "type": "enum";
    "name": string;
    "discriminators": Record<string, number>;
    "tuple-data": Record<string, EEType[]>;
    "null-optimise-discriminator": undefined | number;
    "generics": string[];
    "doc"?: string;
};
type EEEnumValueType = {
    "type": "enumValue";
    "enum": EEEnumType;
    "member"?: string;
    "doc"?: string;
};
type EECallImplementer = {
    "type": "fn";
    "fn": Scope["functions"][string];
    //if this is a member type or method and not associative then transform a.b(c) into b(a,c);
    "associative": boolean;
    "rename"?: string;
    "doc"?: string;
};
type EEStructType = {
    "type": "struct";
    "name": string;
    "properties": Record<string, EEType>;
    "generics": string[];
    "doc"?: string;
};
type EEGenericType = { "type": "valueGeneric"; "name": string };
type EEBuiltinType = {
    "type": "builtin";
    "builtin": "float" | "int" | "string" | "void" | "bool";
};
type EEModuleType = {
    "type": "module";
    "module": { "types": Record<string, EEType> };
    "doc"?: string;
};
type EEWithGenerics = {
    "type": "withGenerics";
    "generics": EEType[];
    "value": EEType;
};
interface Flags {
    scopedReturn?: true;
}

export function builtinType(kind: EEBuiltinType["builtin"]): EEBuiltinType {
    return { "type": "builtin", "builtin": kind };
}
function todo(stm?: Statement, what?: string): Error | never {
    if (stm) stm.span.errorTodo(what);
    //stack trace
    return new Error("todo");
}
function enumCompare(lhs: EEEnumType, rhs: EEEnumType) {
    const keys = Object.keys(lhs.discriminators);
    const keysCheck = Object.keys(rhs.discriminators);
    if (keys.length != keysCheck.length) return false;
    for (const key of keys) {
        if (!keysCheck.includes(key)) return false;
        if (lhs.discriminators[key] != rhs.discriminators[key]) return false;
    }
    return true;
}
function structCompare(lhs: EEStructType, rhs: EEStructType) {
    if (Object.keys(lhs).length != Object.keys(rhs).length) return false;
    for (const p in lhs.properties) {
        if (!(p in rhs.properties)) return false;
        if (!typeEquals(lhs.properties[p], rhs.properties[p])) return false;
    }
    return true;
}
function typelistEquals(
    lhs: EEType[],
    rhs: EEType[],
    generic_match_any = false,
): boolean {
    if (lhs.length != rhs.length) return false;
    for (let i = 0; i < lhs.length; ++i) {
        if (!typeEquals(lhs[i], rhs[i], generic_match_any)) return false;
    }
    return true;
}

function typeHasGenericTemplatingType(ty: EEType): boolean {
    if (ty.type == "valueGeneric") return true;
    if (ty.type == "withGenerics") {
        for (const a of ty.generics) {
            if (typeHasGenericTemplatingType(a)) return true;
        }
        return false;
    }
    return false;
}

function find_generics_by_matching_array(
    generic_x: EEType[],
    shape: EEType[],
    o: Record<string, EEType> = {},
): Record<string, EEType> {
    for (let i = 0; i < generic_x.length; ++i) {
        find_generics_by_matching(generic_x[i], shape[i], o);
    }
    return o;
}

function find_generics_by_matching(
    generic_x: EEType,
    shape: EEType,
    o: Record<string, EEType> = {},
): Record<string, EEType> {
    if (generic_x.type == "valueGeneric") {
        o[generic_x.name] = shape;
    } else if (
        generic_x.type == "withGenerics" && shape.type == "withGenerics"
    ) {
        find_generics_by_matching_array(generic_x.generics, shape.generics, o);
    }
    return o;
}
export function typeEquals(
    lhs: EEType,
    rhs: EEType,
    generic_match_any = false,
): boolean {
    if (lhs.type == "enumValue" && rhs.type == "enum") {
        return typeEquals(lhs.enum, rhs);
    }
    if (rhs.type == "enumValue" && lhs.type == "enum") {
        return typeEquals(rhs.enum, lhs);
    }
    if (lhs.type == "builtin" && rhs.type == "builtin") {
        return lhs.builtin == rhs.builtin;
    } else if (lhs.type == "enum" && rhs.type == "enum") {
        return enumCompare(lhs, rhs);
    } else if (lhs.type == "struct" && rhs.type == "struct") {
        return structCompare(lhs, rhs);
    } else if (lhs.type == "enumValue" && rhs.type == "enumValue") {
        return enumCompare(lhs.enum, rhs.enum);
    } else if (lhs.type == "withGenerics" && rhs.type == "withGenerics") {
        return typelistEquals(lhs.generics, rhs.generics, generic_match_any) &&
            typeEquals(lhs.value, rhs.value, generic_match_any);
    } else if (
        generic_match_any &&
        (lhs.type == "valueGeneric" || rhs.type == "valueGeneric")
    ) {
        return true;
    } else if (lhs.type == "valueGeneric" && rhs.type == "valueGeneric") {
        //TODO: determine whether the names should be equal or that just the generic identifiers existing is enough;
        return lhs.name == rhs.name;
    } else {
        return false;
    }
}

export function parseFlagStatementIdentifier(stm: Statement): string {
    if (stm.type == "ident") return stm.ident.span.content();
    if (stm.type == "dot") {
        return `${
            parseFlagStatementIdentifier(stm.lhs)
        }.${stm.rhs.span.content()}`;
    }
    if (stm.type == "call") return `${parseFlagStatementIdentifier(stm.lhs)}`;
    return "???";
}
export function flagDocumentationStm(stm: Statement): string | undefined {
    return stm.type == "flag" && stm.flag.type == "call" &&
            stm.flag.args.args[0].type == "string"
        ? stm.flag.args.args[0].string.span.content().slice(1, -1)
        : undefined;
}

//adds the generic function being called to the registry (if it wasn't there already) and returns its name
function registryHelper_genericFunction(
    fn_type: EECallImplementer,
    scope: Scope,
    e: CallStatement,
    hint?: EEType,
    g: Record<string, EEType> = {},
): string {
    if (hint) find_generics_by_matching(fn_type.fn.returnType, hint, g);
    if (!fn_type.associative && e.lhs.type == "dot") {
        //self type
        find_generics_by_matching(
            fn_type.fn.parameters[0],
            scope.resolveType(e.lhs.lhs),
            g,
        );
        find_generics_by_matching_array(
            fn_type.fn.parameters.slice(1),
            e.args.args.map((a, i) =>
                scope.resolveType(a, fn_type.fn.parameters[i + 1])
            ),
            g,
        );
    } else {
        find_generics_by_matching_array(
            fn_type.fn.parameters,
            e.args.args.map((a, i) =>
                scope.resolveType(a, fn_type.fn.parameters[i])
            ),
            g,
        );
    }

    const glist = fn_type.fn.generics.map((n) => {
        if (n in g) {
            return g[n];
        } else {
            throw e.span.errorTodo(`Missing Generic parameter ${n} in type`);
        }
    });
    //also register this generic function if it doesn't already exists
    return scope.registry.addGenericFunction(fn_type.fn, glist);
}
export class GlobalImplementationRegistry {
    public implementations: Record<string, {
        "type": EEType;
        "functions": Record<string, EECallImplementer>;
    }> = {};
    public generic_functions: Set<{
        "function": EECallImplementer["fn"];
        "scope": Scope;
        "compile_for": Set<{ "generic-parameters": EEType[]; "name": string }>;
    }> = new Set();

    // public getGenericFunction_name(fn:EECallImplementer["fn"],generics:EEType[]){
    //     for(const a of this.generic_functions){
    //         if(a.function!=fn)continue;
    //     }
    // }

    public addGenericFunction(
        fn: EECallImplementer["fn"],
        generics: EEType[],
    ): string {
        for (const e of this.generic_functions) {
            //check if same function decl (as function decl are never copied, this can be done by checking pointers)
            if (e.function != fn) continue;
            for (const a of e.compile_for) {
                //if this set of generic parameters already exists, exit
                if (typelistEquals(a["generic-parameters"], generics)) {
                    return a.name;
                }
            }
            const name = "generic_" + e.compile_for.size + "_" +
                e.function.def.name.span.content();
            e.compile_for.add({
                "generic-parameters": generics,
                "name": name,
            });
            return name;
        }
        // console.log(fn)
        throw "doesnot exists" + fn;
    }

    public static dissolveGenerics(
        ty: EEType,
        generics: Record<string, EEType>,
    ): EEType {
        if (ty.type == "valueGeneric") {
            if (ty.name in generics) {
                return generics[ty.name];
            } else {
                throw "Type error";
            }
        } else if (ty.type == "withGenerics") {
            return {
                "type": "withGenerics",
                "value": ty.value,
                "generics": ty.generics.map((e) =>
                    this.dissolveGenerics(e, generics)
                ),
            };
        } else {
            return ty;
        }
    }

    public static compileGenericFunction(
        scope: Scope,
        fn: EECallImplementer["fn"],
        withGenerics: EEType[],
        name: string,
    ) {
        //builtins get a pass
        if (fn.flag.builtin) return undefined;

        const n = new Scope(scope.registry);

        n.name = scope.name + "_fn" + name;
        n.parent = scope;
        // fn.fn.returnType
        if (withGenerics.length != fn.generics.length) {
            throw "This error cannot happen because it should be catched in the type checking phase";
        }
        const generics: Record<string, EEType> = {};
        for (let i = 0; i < fn.generics.length; ++i) {
            generics[fn.generics[i]] = withGenerics[i];
        }
        n.requiredReturnType = this.dissolveGenerics(fn.returnType, generics);
        // console.log(n.name,n.requiredReturnType);

        for (const e of fn.def.args) {
            n.variables[e.ident.span.content()] = {
                "type": this.dissolveGenerics(
                    scope.resolveTypeFromTypeStatement(e.type, fn.generics)!,
                    generics,
                )!,
            };
        }
        n.init(fn.def.body);

        return `function ${name}(${
            fn.def.args.map((e) => e.ident.span.content())
        }) {${compileStatements(fn.def.body, n)}}`;
    }

    private compileGenericFunctions(): string {
        let res = "";
        for (const fn of this.generic_functions) {
            for (const variation of fn.compile_for) {
                const str = GlobalImplementationRegistry.compileGenericFunction(
                    fn.scope,
                    fn.function,
                    variation["generic-parameters"],
                    variation.name,
                );
                res += str;
            }
        }
        return res;
    }
    public compile(): string {
        const gen = this.compileGenericFunctions();
        return gen;
    }
}
export class Scope {
    public registry: GlobalImplementationRegistry;
    public parent: Scope | undefined;
    public variables: Record<string, {
        "type": EEType;
    }> = {};
    public isModuleTop = false;
    public types: Record<string, EEType> = {};
    public extensions: Record<string, {
        "functions": Record<string, EECallImplementer>;
        "type": EEType;
        "export": boolean;
    }> = {};
    public exportTypes: Record<string, EEType> = {};
    public functions: Record<string, {
        "flag": {
            "export": boolean;
            "builtin": boolean;
            "unsafeAnyArgs": boolean;
            "doc": string;
        };
        "generics": string[];
        "returnType": EEType;
        "parameters": EEType[];
        "def": FunctionDeclarationStatement;
    }> = {};
    public hasScopedReturn = false;
    public scopedReturnIdentifier?: IdentStatement;
    public scopedReturnType?: EEType;
    public returnType?: EEType;
    // public typeDefinitions:Record<string,{
    //     "type":""
    // }>
    public name = "global";
    public requiredReturnType?: EEType;

    public importTypes: Record<string, EEType> = {};
    public module?: Module;
    constructor(registry: GlobalImplementationRegistry) {
        this.registry = registry;
    }
    public init(body: Statement[]) {
        if (this.module?.cluster?.std_lib && this.module.with_std) {
            const m = this.module.cluster.std_lib;
            this.registerImports([{
                "type": "import",
                "scope": "all",
                "span": Span.Empty,
                "source": {
                    "type": "string",
                    "span": new Span(
                        "::buffer",
                        0,
                        m.length + 2,
                        `"${m}"`,
                        `"${m}"`,
                    ),
                },
            }]);
        }
        this.registerExplicitExports(body);
        this.registerImports(body);
        this.registerTypes(body);
        this.registerFunctions(body);
        this.registerExtensions(body);
        this.registerVariables(body);
        this.checkFlags(body);
        this.typeCheck(body);
    }

    /** @__lsp__ */ public getRootMemberList(): Record<string, EEType> {
        // const ty = this.resolveType(stm);

        // if(stm.type=="ident"){
        //             //     const ty = this.getTypeOfName(stm);
        //             //     if(ty.type == "enum"){
        //         //return the cases
        //         //@ts-ignore not fighting the compiler here
        //         return Object.fromEntries(Object.keys(ty.discriminators).map(key=>{return [key,{"type":"enumValue","enum":ty,"member":key} satisfies EEType]}));
        //     }else if(ty.type == "module"){
        //         return ty.module.types;
        //     }
        // }
        let o: Record<string, EEType> = {};
        for (const v in this.variables) {
            o[v] = this.variables[v].type;
        }
        for (const v in this.functions) {
            o[v] = {
                "type": "fn",
                "fn": this.functions[v],
                "associative": true,
            };
        }

        return {
            ...o,
            ...this.types,
        };
    }
    // This function is intended for the lsp
    /** @__lsp__ */ public getMemberList(
        stm: Statement,
    ): Record<string, EEType> {
        // const ty = this.resolveType(stm);
        if (stm.type == "ident") {
            const ty = this.getTypeOfName(stm);
            if (ty.type == "enum") {
                //return the cases
                //@ts-ignore not fighting the compiler here
                return Object.fromEntries(
                    Object.keys(ty.discriminators).map((key) => {
                        return [
                            key,
                            {
                                "type": "enumValue",
                                "enum": ty,
                                "member": key,
                            } satisfies EEType,
                        ];
                    }),
                );
            } else if (ty.type == "module") {
                return ty.module.types;
            } else {
                //get members from extension
                for (const value of Object.values(this.extensions)) {
                    if (!typeEquals(value.type, ty)) continue;
                    return value.functions;
                }
            }
        }
        return {};
    }

    public getModule(): Module {
        if (this.module) return this.module;
        if (this.parent) return this.parent.getModule();
        throw "trying to call getModule on a detached scope";
    }

    public parseExtensionFunctions(
        body: Statement[],
        flag: { "doc"?: string; "builtin"?: boolean } = {},
    ): Record<string, EECallImplementer> {
        const functions: Record<string, EECallImplementer> = {};
        for (const stm of body) {
            if (stm.type == "flag") {
                const id = parseFlagStatementIdentifier(stm.flag);
                if (id == "documentation") {
                    flag.doc = (flag.doc ?? "") +
                        (flagDocumentationStm(stm) ?? "");
                }
                if (id == "compiler.builtin") flag.builtin = true;
                if (id == "compiler.export") {
                    stm.flag.span.errorTodo(
                        "function declared in an extension are always exported, unless the extension isn't exported",
                    );
                }
                Object.assign(
                    functions,
                    this.parseExtensionFunctions([stm.body], flag),
                );
            } else if (stm.type == "function") {
                const [nm, fn] = this.createFunctionDecl(stm, {
                    "doc": flag.doc,
                    "builtin": flag.builtin,
                    "export": false,
                    "unsafeAnyArgs": false,
                });
                const ty: EECallImplementer = {
                    "doc": flag.doc,
                    "fn": fn,
                    "type": "fn",
                    "associative": false,
                };
                functions[nm] = ty;
            } else {
                stm.span.errorTodo(
                    "only functions are allowed in the body of an extension",
                );
            }
        }
        return functions;
    }
    public registerExtensions(
        body: Statement[],
        flag: { "export"?: boolean; "doc"?: string } = {},
    ) {
        for (const stm of body) {
            if (stm.type == "flag") {
                const id = parseFlagStatementIdentifier(stm.flag);
                if (id == "documentation") {
                    flag.doc = (flag.doc ?? "") +
                        (flagDocumentationStm(stm) ?? "");
                }
                if (id == "compiler.export") flag.export = true;
                this.registerExtensions([stm.body], flag);
            } else if (stm.type == "extension") {
                //extension module.typename {} is not supported
                //recommend user to write to import the module directly or
                //import typename from module
                if (stm.for.type != "type" && stm.for.type != "generic") {
                    stm.for.span.errorTodo(
                        "Cannot implement types for module subtypes",
                    );
                }
                const generics = stm.for.type == "generic"
                    ? stm.for["generic-value"].map((e) => e.span.content())
                    : [];
                const forType = this.resolveTypeFromTypeStatement(
                    stm.for,
                    generics,
                );
                if (forType === undefined) {
                    throw stm.for.span.errorTodo("idk what happened here. GG");
                }
                const id = stm.for.span.content();
                const fns = this.parseExtensionFunctions(stm.body);
                for (const fn_name in fns) {
                    const fn = fns[fn_name];
                    //TODO: take a better look if this restriction could be lifted
                    if (fn.fn.parameters.length == 0) {
                        fn.fn.def.name.span.errorTodo(
                            "A extension function must have at least one self parameter",
                        );
                    }
                    //check wetter the first argument of the function is named self and has the same type as the extension
                    const param0 = fn.fn.parameters[0];
                    const param0name = fn.fn.def.args[0].ident.span.content();
                    if (param0name != "self") {
                        fn.fn.def.args[0].ident.span.errorTodo(
                            "The first argument of an extension must be called `self`",
                        );
                    }

                    if (!typeEquals(param0, forType)) {
                        fn.fn.def.args[0].type.span.incorrectType(
                            this.typenameOf(forType),
                            undefined,
                            this.typenameOf(param0),
                        );
                    }
                    //a builtin extension should remain associative
                    fn.associative = fn.fn.flag.builtin;
                    //also add the rename
                    fn.rename = `${
                        stm["global-type-registry"]
                            ? "implementation"
                            : "extension"
                    }_${id}_${fn_name}`;
                    //add to generic function registry
                    if (fn.fn.generics.length > 0) {
                        this.registry.generic_functions.add({
                            "function": fn.fn,
                            "compile_for": new Set(),
                            "scope": this,
                        });
                    }
                }
                //implementation can only be declared once, and only in the same file the type it's implementing is i
                if (stm["global-type-registry"]) {
                    //TODO: check if the type was declared in the same file;
                    this.registry.implementations[id] = {
                        "functions": fns,
                        "type": forType,
                    };
                } else {
                    this.extensions[id] = {
                        "functions": fns,
                        "type": forType,
                        "export": flag.export ?? false,
                    };
                }
                // const ty = this.resolveTypeFromTypeStatement(stm.for);
            } else {
                //skip
            }
        }
    }

    public registerExplicitExports(
        body: Statement[],
        flag: { "doc"?: string } = {},
    ) {
        for (const stm of body) {
            if (stm.type == "flag") {
                if (parseFlagStatementIdentifier(stm) == "documentation") {
                    flag.doc = (flag.doc ?? "") +
                        (flagDocumentationStm(stm) ?? "");
                }
                this.registerExplicitExports([stm.body], flag);
            } else if (stm.type == "export-module") {
                if (this.module) {
                    if (stm.as) {
                        const imp = this.module.importModule(
                            stm.source.span.content().slice(1, -1),
                        );
                        const a = imp.getAllExports();
                        let t: Record<string, EEType> = {};
                        for (const i of a) {
                            if (i.type == "type") {
                                t[i.name] = i.value;
                            } else if (i.type == "extension") {
                                throw "to add";
                            }
                        }
                        this.exportTypes[stm.as.span.content()] = {
                            "type": "module",
                            "module": {
                                "types": t,
                            },
                            "doc": flag.doc,
                        };
                    } else {
                        const imp = this.module.importModule(
                            stm.source.span.content().slice(1, -1),
                        );
                        const a = imp.getAllExports();
                        for (const i of a) {
                            if (i.type == "type") {
                                this.exportTypes[i.name] = i.value;
                            } else if (i.type == "extension") {
                                this.extensions[i.name] = i.extension;
                            }
                        }
                    }
                } else {
                    stm.span.errorTodo("can only import on modules");
                }
            }
        }
    }
    public registerImports(body: Statement[]) {
        for (const stm of body) {
            if (stm.type == "flag") {
                this.registerImports([stm.body]);
            } else if (stm.type == "import") {
                if (this.module) {
                    if (stm.scope == "all" && !stm.as) {
                        const imp = this.module.importModule(
                            stm.source.span.content().slice(1, -1),
                        );
                        const a = imp.getAllExports();
                        for (const i of a) {
                            if (i.type == "type") {
                                this.types[i.name] = i.value;
                            } else if (i.type == "extension") {
                                this.extensions[i.name] = i.extension;
                            }
                        }
                    } else if (stm.scope == "all" && stm.as) {
                        const imp = this.module.importModule(
                            stm.source.span.content().slice(1, -1),
                        );
                        const a = imp.getAllExports();
                        let o: Record<string, EEType> = {};
                        for (const i of a) {
                            if (i.type == "type") {
                                o[i.name] = i.value;
                            } else if (i.type == "extension") {
                                //register extensions locally
                                this.extensions[i.name] = i.extension;
                            }
                        }
                        this.types[stm.as.span.content()] = {
                            "type": "module",
                            "module": { "types": o },
                        };
                    } else {
                        throw stm.span.errorTodo("");
                    }
                } else {
                    stm.span.errorTodo("can only import on modules");
                }
            }
        }
    }

    // public internal_typenameOf(type:EEType):string{
    //     if(type.type=="builtin"){
    //         return type.builtin;
    //     }
    // }

    public typenameOf(type: EEType): string {
        if (type.type == "builtin") {
            return `${type.builtin}`;
        } else if (type.type == "fn") {
            return `function(${
                type.fn.parameters.map(this.typenameOf).join(", ")
            }):${this.typenameOf(type.fn.returnType)}`;
        } else if (type.type == "enumValue") {
            return this.typenameOf(type.enum);
        } else if (type.type == "enum") {
            return type.generics.length > 0
                ? `Enum<${type.generics.join(", ")}>(${type.name})`
                : `Enum(${type.name})`;
        } else if (type.type == "struct") {
            return `Struct<${type.name}>`;
        }
        if (type.type == "withGenerics") {
            return `${this.typenameOf(type.value)} with <${
                type.generics.map((e) => this.typenameOf(e)).join(", ")
            }>`;
        }
        if (type.type == "valueGeneric") {
            return `(GenericIdentifier)<${type.name}>`;
        }
        throw "error type not exist" + type.type;
    }

    public static global(): Scope {
        const a = new Scope(new GlobalImplementationRegistry());
        // a.functions = {}
        return a;
    }

    public getFunction(ident: IdentifierToken): typeof this.functions[string] {
        const fn_name = ident.span.content();
        if (fn_name in this.functions) {
            return this.functions[fn_name];
        } else if (fn_name in this.types) {
            const t = this.types[fn_name];
            if (t.type == "fn") {
                return t.fn;
            } else {
                ident.span.errorTodo("refers not to a function type in scope");
                // Deno.exit();
            }
        } else if (this.parent) {
            return this.parent.getFunction(ident);
        } else {
            ident.span.errorTodo("This function does not exists");
            // Deno.exit(0);
        }
    }

    public createFunctionDecl(
        stm: FunctionDeclarationStatement,
        flags: Partial<Scope["functions"][0]["flag"]> = {},
    ) {
        const name = stm.name.span.content();
        const generics = stm.generics.map((e) => e.span.content());
        return [name, {
            "def": stm,
            "flag": {
                "builtin": flags.builtin ?? false,
                "export": flags.export ?? false,
                "unsafeAnyArgs": flags.unsafeAnyArgs ?? false,
                "doc": flags.doc ?? "",
            },
            "generics": generics,
            "returnType": this.resolveTypeFromTypeStatement(
                stm.returnType,
                generics,
            )!,
            "parameters": stm.args.map((e) =>
                this.resolveTypeFromTypeStatement(e.type, generics)!
            ),
        }] as const;
    }
    public registerFunctions(body: Statement[]) {
        const register = (
            stm: Statement,
            flags: Partial<Scope["functions"][0]["flag"]> = {},
        ) => {
            if (stm.type == "flag") {
                const flag = parseFlagStatementIdentifier(stm.flag);
                if (flag == "compiler.export") flags.export = true;
                if (flag == "compiler.builtin") flags.builtin = true;
                if (flag == "unsafe.js.anyArgs") flags.unsafeAnyArgs = true;
                if (flag == "documentation") {
                    flags.doc =
                        stm.flag.type == "call" &&
                            stm.flag.args.args[0].type == "string"
                            ? stm.flag.args.args[0].string.span.content().slice(
                                1,
                                -1,
                            )
                            : undefined;
                }
                register(stm.body, flags);
            }
            if (stm.type == "function") {
                const name = stm.name.span.content();
                const generics = stm.generics.map((e) => e.span.content());
                this.functions[name] = {
                    "def": stm,
                    "flag": {
                        "builtin": flags.builtin ?? false,
                        "export": flags.export ?? false,
                        "unsafeAnyArgs": flags.unsafeAnyArgs ?? false,
                        "doc": flags.doc ?? "",
                    },
                    "generics": generics,
                    "returnType": this.resolveTypeFromTypeStatement(
                        stm.returnType,
                        generics,
                    )!,
                    "parameters": stm.args.map((e) =>
                        this.resolveTypeFromTypeStatement(e.type, generics)!
                    ),
                };
                if (generics.length > 0) {
                    this.registry.generic_functions.add({
                        "compile_for": new Set(),
                        "function": this.functions[name],
                        "scope": this,
                    });
                }
            }
        };
        for (const stm of body) {
            register(stm);
        }
    }

    ///Returns the return type this scope or its parent scope should return
    public getRequiredReturnType(): EEType | undefined {
        if (this.requiredReturnType) return this.requiredReturnType;
        if (this.parent) return this.parent.getRequiredReturnType();
        return undefined;
    }

    public typeCheck(body: Statement[]) {
        for (const stm of body) {
            if (stm.type == "struct") continue;
            if (
                stm.type == "cmp" || stm.type == "cmp.gt" ||
                stm.type == "cmp.gte" || stm.type == "cmp.lt" ||
                stm.type == "cmp.lte" || stm.type == "cmp.not"
            ) {
                //check if left hand and right side are both the same primitive
                //also give the compiler a small hint when resolving the left or right type
                let l: EEType | undefined, r: EEType | undefined;
                try {
                    l = this.resolveTypeMaybe(stm.lhs);
                    r = this.resolveType(stm.rhs, l);
                } catch {
                    r = this.resolveType(stm.rhs);
                    l = this.resolveType(stm.lhs, r);
                }
                if (l == undefined || r == undefined) {
                    throw stm.span.errorTodo(
                        "could not resolve type of the comparee's",
                    );
                }
                if (l.type == "builtin" && r.type == "builtin") {
                    if (!typeEquals(l, r)) {
                        stm.rhs.span.incorrectType<undefined>(
                            this.typenameOf(l),
                            undefined,
                            this.typenameOf(r),
                        );
                    }
                    //voids should not be compared
                    if (l.builtin == "void") {
                        stm.span.errorTodo(
                            "comparing voids to voids is like comparing the empty space inside an empty box to an empty abyss. They are both empty, yet are their emptinesses the same? if not, how would one compare them? and if all emptiness, or lack something, is the same, then why didn't you just write `true` instead of writing a comparison that should not exist. ",
                        );
                    }
                    //the type is correct
                } else {
                    stm.span.errorTodo(
                        "support for the compare trait is currently limited, please only compare primitive types",
                    );
                }
            }
            if (
                stm.type == "assign" || stm.type == "assign.add" ||
                stm.type == "assign.div" || stm.type == "assign.mul" ||
                stm.type == "assign.sub"
            ) {
                const lhs = this.resolveType(stm.lhs);
                const rhs = this.resolveType(stm.rhs, lhs);
                if (!typeEquals(lhs!, rhs!)) {
                    const t = this.resolveLocalTypePath(lhs!)!;
                    const r = this.resolveLocalTypePath(rhs!)!;
                    stm.rhs.span.incorrectType(
                        t,
                        Explainer.IncorrectRightHandTypeInAssignment,
                        r,
                    );
                }
                continue;
            }
            if (stm.type == "flag") {
                this.typeCheck([stm.body]);
                continue;
            }
            if (
                stm.type == "export-module" || stm.type == "import" ||
                stm.type == "import-from-type"
            ) {
                //these are all good
                continue;
            }
            if (stm.type == "return") {
                const rtn_type = this.getRequiredReturnType();
                if (rtn_type) {
                    // console.log(this.variables)
                    if (
                        !typeEquals(
                            rtn_type,
                            this.resolveType(stm.body, rtn_type),
                        )
                    ) {
                        stm.body.span.incorrectType(
                            this.typenameOf(rtn_type),
                            undefined,
                            this.typenameOf(this.resolveType(stm.body)),
                        );
                    }
                } else {
                    // throw new Error("stack trace");
                    stm.span.errorTodo(
                        "Unexpected return. Return is not valid in this context",
                    );
                }
                continue;
            }
            if (stm.type == "let") {
                //allready checked by the declare variable routien
                continue;
            }
            // if(stm.type=="dot"){
            //     const t = this.resolveType(stm);
            // }
            if (stm.type == "function") {
                //a funciton shouldnot be typechecked like this if it's a generic
                if (stm.generics.length > 0) continue;
                //typecheck the body
                const sub = new Scope(this.registry);
                sub.name = `${this.name}_fn${stm.name.span.content()}`;
                const genrics = stm.generics.map((e) => e.span.content());
                for (const e of stm.args) {
                    sub.variables[e.ident.span.content()] = {
                        "type": this.resolveTypeFromTypeStatement(
                            e.type,
                            genrics,
                        )!,
                    };
                }
                sub.requiredReturnType = this.resolveTypeFromTypeStatement(
                    stm.returnType,
                    genrics,
                );
                sub.parent = this;
                // sub.variables[]
                sub.init(stm.body);

                continue;
                // sub.typeCheck
                // stm.args.map(e=>this.resolveTypeFromTypeStatement(e.type));
                // this.resolveTypeFromTypeStatement(stm.returnType);
            }
            if (stm.type == "call") {
                const callee = this.resolveType(stm.lhs);
                if (callee.type != "fn") {
                    return stm.span.errorTodo(
                        "implement error: not a function",
                    );
                }
                //check the args
                if (callee.fn.flag.builtin && callee.fn.flag.unsafeAnyArgs) {
                    continue;
                }
                const supplied = stm.args.args.map((e, i) =>
                    this.resolveType(e, callee.fn.parameters[i])
                );
                // if(supplied.length!=callee.fn.parameters.length&&callee.associative)
                if (
                    supplied.length == callee.fn.parameters.length - 1 &&
                    !callee.associative
                ) {
                    if (stm.lhs.type != "dot") {
                        return stm.lhs.span.errorTodo("must be dot");
                    }
                    const s_type = this.resolveType(stm.lhs.lhs);
                    if (!s_type) throw "";
                    const same = [
                        [
                            typeEquals(s_type, callee.fn.parameters[0]),
                            s_type,
                            0,
                        ] as const,
                        ...supplied.map((e, i) =>
                            [
                                typeEquals(e, callee.fn.parameters[i + 1]),
                                e,
                                i + i,
                            ] as const
                        ),
                    ];
                    for (const [isSame, l, i] of same) {
                        if (!isSame) {
                            stm.args.args[i].span.incorrectType(
                                this.resolveLocalTypePath(
                                    callee.fn.parameters[i],
                                ),
                                undefined,
                                this.resolveLocalTypePath(l),
                            );
                        }
                    }
                    continue;
                } else if (supplied.length != callee.fn.parameters.length) {
                    return stm.span.errorTodo(
                        "implement error: params not same length",
                    );
                }
                const same = supplied.map((e, i) =>
                    [typeEquals(e, callee.fn.parameters[i]), e, i] as const
                );
                for (const [isSame, l, i] of same) {
                    if (!isSame) {
                        stm.args.args[i].span.incorrectType(
                            this.resolveLocalTypePath(callee.fn.parameters[i]),
                            undefined,
                            this.resolveLocalTypePath(l),
                        );
                    }
                }
                continue;
                // callee.fn.parameters
            }

            this.resolveType(stm);
        }
    }
    public makeIdent(name: string): IdentStatement {
        const span = new Span("::buffer", 0, name.length, name, name);
        return {
            "type": "ident",
            "ident": { "type": "ident", "span": span },
            "span": span,
        };
    }
    private checkFlag(stm: Statement, flags: Flags = {}) {
        if (stm.type == "flag") {
            const f = parseFlagStatementIdentifier(stm.flag);
            if (f == "compiler.scopedReturn") flags.scopedReturn = true;
            this.checkFlag(stm.body, flags);
        } else {
            if (flags.scopedReturn) {
                const og = { ...stm };
                stm.type = "assign";
                const name = `${this.name}_CompilerScopedReturn`;
                this.scopedReturnIdentifier = this.makeIdent(name);
                if (stm.type == "assign") {
                    const t = this.resolveType(og);
                    if (
                        this.scopedReturnType &&
                        !typeEquals(this.scopedReturnType, t)
                    ) stm.span.errorTodo("wrong type");
                    this.scopedReturnType = t;
                    // if(this.scopedReturnType&&!typeEquals(this.scopedReturnType,t))stm.span.errorTodo("wrong type");
                    stm.lhs = this.scopedReturnIdentifier;
                    stm.rhs = og;
                }
            }
        }
    }
    public checkFlags(body: Statement[]) {
        const last = body.at(-1);
        if (!last) return;
        this.checkFlag(last);
    }
    public getTypeOfName(name: IdentifierToken): EEType {
        const str = name.span.content();
        const fnType = this.functions[str];

        const type = fnType
            ? {
                "type": "fn",
                "fn": fnType,
                "doc": fnType.flag.doc,
                "associative": true,
            } as const
            : this.variables[str]?.type ?? this.types[str];
        if (type == undefined) {
            // if(!this.parent)throw `unknown var ${str}`;
            if (!this.parent) {
                name.span.errorTodo("This variable does not exists");
                // Deno.exit();
            }
            return this.parent.getTypeOfName(name);
        }
        return type;
    }
    public getTypeMember(ofType: EEType, member: string): EEType | undefined {
        if (ofType.type == "enum") {
            if (ofType.discriminators[member] != undefined) {
                return {
                    "type": "enumValue",
                    "enum": ofType,
                    "member": member,
                };
            }
        }
        if (ofType.type == "module") {
            if (member in ofType.module.types) {
                return ofType.module.types[member];
            }
        }
        //check if type has an extension
        for (const e of Object.values(this.extensions)) {
            if (!typeEquals(e.type, ofType)) continue;
            if (member in e.functions) {
                return e.functions[member];
            }
        }
        //check if type has implementation
        for (const e of Object.values(this.registry.implementations)) {
            if (!typeEquals(e.type, ofType, true)) continue;
            if (member in e.functions) {
                return e.functions[member];
            }
        }

        return undefined;
    }
    public resolveTypeFromTypeStatement(
        stm?: TypeStatement,
        generics: string[] = [],
    ): EEType | undefined {
        if (!stm) return undefined;
        if (stm.type == "type") {
            const name = stm.name.span.content();
            if (name == "int") return builtinType("int");
            if (name == "float") return builtinType("float");
            if (name == "void") return builtinType("void");
            if (name == "bool") return builtinType("bool");
            if (name == "string") return builtinType("string");
            if (generics.includes(name)) {
                return { "type": "valueGeneric", "name": name };
            }
            const t = this.types[name] ??
                this.parent?.resolveTypeFromTypeStatement(stm, generics);
            if (!t) {
                stm.span.errorTodo("this type does not exists");
                return undefined;
            }
            if (t.type == "enum") {
                return {
                    "type": "enumValue",
                    "enum": t,
                };
            }
            if (t.type == "struct") {
                return t;
            }
            // if(t.type=="")
            // if(name == "float")return builtinType("int");
        } else if (stm.type == "generic") {
            return {
                "type": "withGenerics",
                "generics": stm["generic-value"].map((e) =>
                    this.resolveTypeFromTypeStatement(e, generics)!
                ),
                "value": this.getTypeOfName(stm.name),
            };
        }
        stm.span.errorTodo("type could not be resolved");
        // throw "error"
    }
    public resolveTypeMaybe(stm: Statement, hint?: EEType) {
        const a = Span.ErrorHandler;
        Span.ErrorHandler = () => {
            throw "recover";
        };
        try {
            const t = this.resolveType(stm, hint);
            Span.ErrorHandler = a;
            return t;
        } catch {
            Span.ErrorHandler = a;
        }
    }
    public resolveType(stm: Statement, hint?: EEType): EEType {
        const t = (e: Statement) => {
            throw todo(e, `implement type resolver for \`${e.type}\``);
        };
        const table: {
            [Key in Statement["type"]]: (
                value: Statement & { "type": Key },
            ) => EEType;
        } = {
            "cmp": (e) => builtinType("bool"),
            "cmp.not": (e) => builtinType("bool"),
            "cmp.lt": (e) => builtinType("bool"),
            "cmp.lte": (e) => builtinType("bool"),
            "cmp.gt": (e) => builtinType("bool"),
            "cmp.gte": (e) => builtinType("bool"),
            "for": (e) => builtinType("void"),
            "export-module": t,
            "import": t,
            "import-from-type": t,
            "assign": t,
            "assign.add": t,
            "assign.div": t,
            "assign.mul": t,
            "assign.sub": t,
            "range": t,
            "struct-data": (stm) => {
                const ty = this.resolveTypeFromTypeStatement(stm.name)!;

                if (ty.type != "struct") {
                    throw stm.name.span.errorTodo("Expected a structured type");
                }
                for (const prop in stm.properties) {
                    const t = ty.properties[prop];
                    const r = this.resolveType(stm.properties[prop].rhs, t);
                    if (!typeEquals(t, r)) {
                        stm.properties[prop].rhs.span.incorrectType(
                            this.typenameOf(t),
                            undefined,
                            this.typenameOf(r),
                        );
                    }
                }
                return ty;
            },

            "match": (e) => {
                const match_over_type = this.resolveType(e.expr);
                const types = e["match-cases"].map((a) => {
                    if (a.type == "inline") {
                        return this.resolveType(a.body, hint);
                    }
                    const s = new Scope(this.registry);
                    //add the variables to the scope
                    if (a.pattern.type == "call") {
                        const val = this.resolveType(a.pattern.lhs);
                        if (
                            val.type != "enumValue" || val.member == undefined
                        ) throw "later";

                        // find_generics_by_matching(val.enum)
                        if (match_over_type.type !== "withGenerics") {
                            // throw "joe bidden";
                        }
                        let o: Record<string, EEType> = {};
                        for (let i = 0; i < val.enum.generics.length; ++i) {
                            o[val.enum.generics[i]] =
                                match_over_type.generics[i];
                        }
                        if (val.member in val.enum["tuple-data"]) {
                            let b = val.enum["tuple-data"][val.member];
                            if (b) {
                                for (let i = 0; i < b.length; ++i) {
                                    let ty = GlobalImplementationRegistry
                                        .dissolveGenerics(b[i], o);
                                    s.variables[
                                        a.pattern.args.args[i].span.content()
                                    ] = { "type": ty };
                                    // console.log("vars",s.variables);
                                }
                            }
                        }

                        // console.log(o,match_over_type)
                        // console.log(GlobalImplementationRegistry.dissolveGenerics(match_over_type,o));
                    }
                    // console.log("init with vars");
                    s.parent = this;
                    s.init(a.body);
                    if (!s.scopedReturnType) return builtinType("void");
                    return s.scopedReturnType;
                });
                //TODO: VALIDATE TYPES
                return types[0];
            },
            "dot": (e) => {
                const member = this.getTypeMember(
                    this.resolveType(e.lhs)!,
                    e.rhs.span.content(),
                );
                if (!member) throw e.rhs.span.errorTodo("member error");
                //check if this is an enum with generics
                if (
                    member.type == "enumValue" &&
                    member.enum.generics.length > 0 && hint &&
                    hint.type == "withGenerics"
                ) {
                    //can the generic value be derived from hint?
                    return {
                        "type": "withGenerics",
                        "generics": hint.generics,
                        "value": member,
                    };
                }
                //if this is an data-empty case, and the enum uses generics. throw error if no hint is available
                if (
                    member.type == "enumValue" &&
                    member.enum.generics.length > 0 && member.member &&
                    !(member.member in member.enum["tuple-data"])
                ) e.span.errorTodo("cannot interpret the generic value to use");
                return member;
                // throw "no typemeber error";
                // e.lhs
            },
            "return": t,
            //@ts-ignore TODO: check what is goign wrong here
            "call": (e) => {
                const fn_type = this.resolveType(e.lhs);
                if (fn_type.type == "fn") {
                    if (typeHasGenericTemplatingType(fn_type.fn.returnType)) {
                        //Try to figure out what generic value should be
                        //firstly try shapping to the hint
                        const g = {};
                        registryHelper_genericFunction(
                            fn_type,
                            this,
                            e,
                            hint,
                            g,
                        );

                        return GlobalImplementationRegistry.dissolveGenerics(
                            fn_type.fn.returnType,
                            g,
                        );
                    }
                    return fn_type.fn.returnType;
                } else if (fn_type.type == "enumValue") {
                    if (fn_type.enum.generics.length > 0) {
                        //parse generic values
                        const types = e.args.args.map((e) =>
                            this.resolveType(e)
                        );
                        let genericList: EEType[] = [];
                        if (
                            fn_type.member &&
                            fn_type.member in fn_type.enum["tuple-data"]
                        ) {
                            const expected_types =
                                fn_type.enum["tuple-data"][fn_type.member];
                            if (types.length != expected_types.length) {
                                e.span.errorTodo("invalid number of arguments");
                            }

                            for (let i = 0; i < expected_types.length; ++i) {
                                const expected = expected_types[i];
                                const t = types[i];
                                if (expected.type == "valueGeneric") {
                                    const i = fn_type.enum.generics.indexOf(
                                        expected.name,
                                    );
                                    genericList[i] = t;
                                } else {
                                    //validate type
                                    if (!typeEquals(expected, t)) {
                                        e.args.args[i].span.errorTodo(
                                            "invalid type, expected: " +
                                                this.typenameOf(expected),
                                        );
                                    }
                                }
                            }
                        }
                        return {
                            "type": "withGenerics",
                            "generics": genericList,
                            "value": fn_type,
                        };
                    }
                    return fn_type;
                } else {
                    e.span.errorTodo("idk what ya doing");
                    // Deno.exit();
                }
            },
            "enum": () => builtinType("void"),
            "extension": () => builtinType("void"),
            "flag": (e) => this.resolveType(e.body, hint),
            "float": (_) => builtinType("float"),
            "int": (_) => builtinType("int"),
            "string": (_) => builtinType("string"),
            "group": (e) => this.resolveType(e.group),
            "ident": (e) => {
                return this.getTypeOfName(e.ident);
            },
            //TODO: Technically if statements should adhere to the scoped return rules, thus can return a value. for now just error
            "if": (e) => builtinType("void"),
            //TODO: Technically while statements should adhere to the scoped return rules, thus can return a value. for now just error
            "while": (e) => builtinType("void"),
            "let": t,
            "math.sub": (e) => {
                const lhs = this.resolveType(e.lhs);
                const rhs = this.resolveType(e.rhs);
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("int");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                throw todo(e, "implement sub error");
            },
            "math.add": (e) => {
                const lhs = this.resolveType(e.lhs);
                const rhs = this.resolveType(e.rhs);
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("int");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                throw todo(e, "implement add error");
            },
            "math.mul": (e) => {
                const lhs = this.resolveType(e.lhs);
                const rhs = this.resolveType(e.rhs);
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("int");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                throw todo(e, "implement mul error");
            },
            "math.div": (e) => {
                const lhs = this.resolveType(e.lhs);
                const rhs = this.resolveType(e.rhs);
                //TODO: add int div trait
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "int"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "int" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                if (
                    lhs?.type == "builtin" && lhs.builtin == "float" &&
                    rhs?.type == "builtin" && rhs.builtin == "float"
                ) return builtinType("float");
                throw todo(e, "implement mul error");
            },

            "function": (e) => {
                throw todo(
                    e,
                    "function type. This should not be a resolved type",
                );
            },
            // "scope":(e)=>{throw todo(e,"implemtent scope return type")},
            "scope": (e) => {
                //last statement must be a return or scoped return
                const s = new Scope(this.registry);
                s.parent = this;
                s.init(e.body);
                if (!s.scopedReturnType) return builtinType("void");
                return s.scopedReturnType;

                // const last = e.body.at(-1);
                // if(!last)return builtinType("void");
                // if(last.type == "flag"){

                // }
                // builtinType("int")
            },
        };
        const value = ((table[stm.type] ?? ((e) => {
            throw t(e);
        })) as (value: Statement) => EEType)(stm);
        return value;
    }

    public registerTypes(
        body: Statement[],
        flags: { "export"?: boolean; "doc"?: string } = {},
    ) {
        for (let stm of body) {
            if (stm.type == "flag") {
                const t = parseFlagStatementIdentifier(stm.flag);

                if (t == "compiler.export") flags.export = true;
                if (t == "documentation") {
                    flags.doc = (flags.doc ?? "") + "\n" +
                        (flagDocumentationStm(stm) ?? "");
                }
                this.registerTypes([stm.body], flags);
            }
            if (stm.type == "struct") {
                let props: Record<string, EEType> = {};
                for (const n in stm.properties) {
                    props[n] = this.resolveTypeFromTypeStatement(
                        stm.properties[n].type,
                    )!;
                }
                this.types[stm.name.span.content()] = {
                    "type": "struct",
                    "doc": flags.doc,
                    "properties": props,
                    "generics": [],
                    "name": stm.name.span.content(),
                };
            }
            if (stm.type == "enum") {
                const keys = Object.keys(stm.cases);
                const enumType: EEEnumType = {
                    "name": stm.name.span.content(),
                    "type": "enum",
                    "discriminators": {},
                    "tuple-data": {},
                    "generics": [],
                    "null-optimise-discriminator": undefined,
                };
                if (stm.generics) {
                    enumType.generics = stm.generics.map((e) =>
                        e.span.content()
                    );
                }
                for (const key of keys) {
                    enumType.discriminators[key] = stm.cases[key].discriminator;
                    const d = stm.cases[key].data;
                    if (d?.type == "tuple") {
                        enumType["tuple-data"][key] = d.types.map((e) =>
                            this.resolveTypeFromTypeStatement(
                                e,
                                enumType.generics,
                            )!
                        );
                    }
                }

                if (
                    Object.keys(enumType.discriminators).length == 2 &&
                    Object.keys(enumType["tuple-data"]).length == 1
                ) {
                    //null optimise
                    let h = Object.keys(enumType["tuple-data"])[0];
                    let d = Object.keys(enumType.discriminators);
                    let e = d[0] == h ? d[1] : d[0];
                    const disc = enumType.discriminators[e];
                    enumType["null-optimise-discriminator"] = disc;
                }
                enumType.doc = flags.doc;
                this.types[stm.name.span.content()] = enumType;
                if (flags.export) {
                    this.exportTypes[stm.name.span.content()] = enumType;
                }
            }
        }
    }
    public resolveLocalTypePath(t: EEType): string | undefined {
        if (t.type == "builtin") {
            if (t.builtin == "float") return "float";
            if (t.builtin == "int") return "int";
            if (t.builtin == "void") return "void";
            if (t.builtin == "bool") return "bool";
            if (t.builtin == "string") return "string";
            // if(t.builtin=="int")return "int";
        }
        return undefined;
    }
    public registerVariables(body: Statement[]) {
        for (let stm of body) {
            if (stm.type == "flag") {
                stm = stm.body;
            }
            if (stm.type == "let") {
                const declareType = stm["value-type"];
                const checkType = this.resolveTypeFromTypeStatement(
                    declareType,
                );
                //resolve type
                const shouldBe = this.resolveType(stm.rhs, checkType);

                if (!shouldBe) {
                    throw stm.span.errorTodo("Cannot resolve to of variable");
                }
                if (checkType && !typeEquals(shouldBe, checkType)) {
                    stm["value-type"]?.span.incorrectType(
                        this.resolveLocalTypePath(shouldBe),
                        Explainer.IncorrectTypeInLetAssignment,
                    );
                }
                this.variables[stm.identifier.span.content()] = {
                    "type": shouldBe,
                };
            }
        }
    }
}

export function compile(statements: Statement[], indent = 0) {
    const scope = new Scope(new GlobalImplementationRegistry());
    scope.name = "main";
    scope.init(statements);
    scope.isModuleTop = true;
    // scope.registerVariables(statements);
    return compileStatements(statements, scope);
}
export function compileStatements(statements: Statement[], scope: Scope) {
    return statements.map((e) => compileStatement(e, scope)).filter((e) =>
        e != undefined
    ).join(";");
}
export function compileStatement(
    stm: Statement,
    scope: Scope,
    hint?: EEType,
): string | undefined {
    if (!(stm.type in compilationTable)) {
        console.log(stm);
        throw `${stm.type} is not compilable`;
    }
    return (compilationTable[stm.type] as (
        value: Statement,
        scope: Scope,
        hint?: EEType,
    ) => string | undefined)(stm, scope, hint);
}

const compilationTable: {
    [Key in Statement["type"]]: (
        value: Statement & { "type": Key },
        scope: Scope,
        hint?: EEType,
    ) => string | undefined;
} = {
    "import": () => undefined,
    "export-module": () => undefined,
    "import-from-type": () => undefined,
    "while": (stm, scope) => {
        const sub_scope = new Scope(scope.registry);
        sub_scope.name = scope.name + "_loop";
        sub_scope.parent = scope;
        sub_scope.init(stm.body);
        return `while(${compileStatement(stm.expr, scope)}){${
            compileStatements(stm.body, sub_scope)
        }}`;
    },
    //TODO: range iterator etc
    "range": () => undefined,
    "for": (stm, scope) => {
        const sub_scope = new Scope(scope.registry);
        sub_scope.name = scope.name + "_loop";
        sub_scope.parent = scope;
        sub_scope.init(stm.body);
        //currently there is no iterator trait. thus only allow iterating over predefined range
        if (stm.expr.type == "range") {
            const ty_l = scope.resolveType(stm.expr.lhs, builtinType("int"));
            const ty_r = scope.resolveType(stm.expr.rhs, builtinType("int"));
            if (
                !typeEquals(ty_l, builtinType("int")) ||
                !typeEquals(ty_r, builtinType("int"))
            ) throw stm.expr.span.errorTodo("habibi");
            const i = stm.ident.span.content();
            return `for(let ${i} = ${
                compileStatement(stm.expr.lhs, scope)
            };${i}<${compileStatement(stm.expr.rhs, scope)};++${i}){${
                compileStatements(stm.body, sub_scope)
            }}`;
        } else {
            stm.expr.span.errorTodo(
                "currently only constant range expressions are allowed",
            );
        }
    },

    "extension": (stm, scope) => {
        const n = stm.for.span.content();
        const fns = stm["global-type-registry"]
            ? scope.registry.implementations[n].functions
            : scope.extensions[n].functions;
        let rtn = `/*extension(${n})*/`;
        for (const fn_name in fns) {
            const fn = fns[fn_name];
            if (fn.fn.flag.builtin) continue;
            //uses the generic compiler
            if (fn.fn.generics.length > 0) continue;
            // fn.rename = `extension_${n}_${fn_name}`;
            // compileStatement(fn)
            const subscope = new Scope(scope.registry);
            subscope.name = scope.name + "extension";
            subscope.parent = scope;
            let i = 0;
            for (const arg of fn.fn.def.args) {
                const n = arg.ident.span.content();
                subscope.variables[n] = { "type": fn.fn.parameters[i] };
                i += 1;
            }
            subscope.requiredReturnType = fn.fn.returnType;
            subscope.init(fn.fn.def.body);
            // console.log(subscope.name,fn.fn.returnType);
            rtn += `function ${
                stm["global-type-registry"] ? "implementation" : "extension"
            }_${n}_${fn_name}(${
                fn.fn.def.args.map((e) => e.ident.span.content()).join()
            }){${compileStatements(fn.fn.def.body, subscope)}}`;
        }
        return rtn;
    },
    "cmp": (stm, scope) => {
        //TODO: in the future make use of traits for this whenever the types aren't builtin
        return `${compileStatement(stm.lhs, scope)}==${
            compileStatement(stm.rhs, scope)
        }`;
    },
    "cmp.not": (stm, scope) => {
        //TODO: in the future make use of traits for this whenever the types aren't builtin
        return `${compileStatement(stm.lhs, scope)}!=${
            compileStatement(stm.rhs, scope)
        }`;
    },
    "cmp.lt": (stm, scope) => {
        //TODO: in the future make use of traits for this whenever the types aren't builtin
        return `${compileStatement(stm.lhs, scope)}<${
            compileStatement(stm.rhs, scope)
        }`;
    },
    "cmp.lte": (stm, scope) => {
        //TODO: in the future make use of traits for this whenever the types aren't builtin
        return `${compileStatement(stm.lhs, scope)}<=${
            compileStatement(stm.rhs, scope)
        }`;
    },
    "cmp.gt": (stm, scope) => {
        //TODO: in the future make use of traits for this whenever the types aren't builtin
        return `${compileStatement(stm.lhs, scope)}>${
            compileStatement(stm.rhs, scope)
        }`;
    },
    "cmp.gte": (stm, scope) => {
        //TODO: in the future make use of traits for this whenever the types aren't builtin
        return `${compileStatement(stm.lhs, scope)}>=${
            compileStatement(stm.rhs, scope)
        }`;
    },
    "call": (stm, scope, hint) => {
        if (stm.lhs.type == "ident") {
            let fn = scope.getFunction(stm.lhs.ident);
            if (fn.flag.builtin) {
                const n = fn.def.name.span.content();
                if (n == "builtin_type") {
                    const r = scope.resolveType(stm.args.args[0]);
                    return `"${scope.typenameOf(r)}"`;
                } else if (n == "builtin_panic_handler") {
                    return scope.getModule().cluster.compilation_settings
                        .panic_handler_js;
                } else {
                    // throw  new Error("wrong builtin function: "+n);
                }
            }
        }
        let callee = scope.resolveType(stm.lhs);
        if (callee.type == "enumValue") {
            // if(callee.enum["null-optimise-discriminator"]){
            //     callee.enum
            // }
            if (!callee.member) {
                stm.lhs.span.errorUnexpected(
                    undefined,
                    "somthing went very wrong",
                );
            }
            const data = callee.enum["tuple-data"][callee.member!];
            if (!data) {
                stm.span.errorUnexpected(
                    undefined,
                    "Trying to add data to a case that doesn't is not allowed",
                );
            }
            if (
                stm.args.args.length == 1 &&
                callee.enum["null-optimise-discriminator"]
            ) {
                return `${compileStatement(stm.args.args[0], scope)}`;
            } else if (callee.enum["null-optimise-discriminator"]) {
                return `[${
                    stm.args.args.map((e) => compileStatement(e, scope)).join(
                        ",",
                    )
                }]`;
            } else {
                return `[${callee.enum.discriminators[callee.member!]},${
                    stm.args.args.map((e) => compileStatement(e, scope)).join(
                        ",",
                    )
                }]`;
            }
        } else if (callee.type == "fn") {
            //if the function requires a form a generics, be extra carefull with the name
            let force_rename: string | undefined = undefined;
            if (callee.fn.generics.length > 0) {
                force_rename = registryHelper_genericFunction(
                    callee,
                    scope,
                    stm,
                    hint,
                );
                // console.log("force rename",force_rename)
            }

            if (callee.associative && !force_rename) {
                return `${compileStatement(stm.lhs, scope)}(${
                    stm.args.args.map((e) => compileStatement(e, scope)).join(
                        ",",
                    )
                })`;
            } else {
                //if the number of argument is one less then expected then convert to a non associative function
                if (stm.args.args.length == callee.fn.parameters.length - 1) {
                    //there now must be aa dot accessor
                    if (stm.lhs.type != "dot") {
                        throw stm.lhs.span.errorTodo(
                            "either call an non-associative function as a.b(c) or b(a,c)",
                        );
                    }

                    return `${
                        force_rename ?? callee.rename ??
                            stm.lhs.rhs.span.content()
                    }(${compileStatement(stm.lhs.lhs, scope)}${
                        stm.args.args.map((e) =>
                            `,${compileStatement(e, scope)}`
                        )
                    })`;
                } else {
                    return `${
                        force_rename ?? compileStatement(stm.lhs, scope)
                    }(${
                        stm.args.args.map((e) => compileStatement(e, scope))
                            .join(",")
                    })`;
                }
            }
        } else {
            //this error will be caught be the typecheckker so this line ay be removed
            return `${compileStatement(stm.lhs, scope)}(${
                stm.args.args.map((e) => compileStatement(e, scope)).join(",")
            })`;
        }
    },
    "dot": (stm, scope) => {
        const lhsType = scope.resolveType(stm.lhs);
        if (lhsType?.type == "enum") {
            //do enum optimisation
            const member = stm.rhs.span.content();
            const discriminator = lhsType.discriminators[member];
            if (lhsType["null-optimise-discriminator"] == discriminator) {
                return `null`;
            }
            if (member in lhsType["tuple-data"]) {
                stm.rhs.span.errorTodo(
                    "Expected () after case, because it holds enum data",
                );
            }
            return `${discriminator}`;
        }
        return `${compileStatement(stm.lhs, scope)}.${stm.rhs.span.content()}`;
    },
    "float": (stm) => `${stm.float.span.content()}`,
    "string": (stm) => `${stm.string.span.content()}`,
    "int": (stm) => `${stm.int.span.content()}`,
    "ident": (stm) => `${stm.ident.span.content()}`,
    "if": (stm, scope) => {
        const condition = `if(${compileStatement(stm.expr, scope)}){${
            compileStatements(stm.body, scope)
        }}`;
        if (stm.else) {
            return `${condition}else{${compileStatements(stm.else, scope)}}`;
        }
        if (stm.chainElseIf) {
            return `${condition}else ${
                compileStatement(stm.chainElseIf, scope)
            }`;
        }
        return condition;
    },
    "let": (stm, scope) => {
        //TODO: move this logic and make ik more unified
        if (stm.rhs.type == "scope") {
            //render scope before assignment
            // scope.makeIdent(`${scope.name}_sCompilerScopedReturn`)
            return `let ${scope.name}_sCompilerScopedReturn;${
                compileStatement(stm.rhs, scope)
            };let ${stm.identifier.span.content()} = ${scope.name}_sCompilerScopedReturn`;
        }
        const hint = scope.resolveTypeFromTypeStatement(stm["value-type"]);
        return `let ${stm.identifier.span.content()} = ${
            compileStatement(stm.rhs, scope, hint)
        }`;
    },
    "return": (stm, scope) => `return ${compileStatement(stm.body, scope)}`,
    "math.add": (stm, scope) =>
        `(${compileStatement(stm.lhs, scope)} + ${
            compileStatement(stm.rhs, scope)
        })`,
    "math.mul": (stm, scope) =>
        `(${compileStatement(stm.lhs, scope)} * ${
            compileStatement(stm.rhs, scope)
        })`,
    "math.sub": (stm, scope) =>
        `(${compileStatement(stm.lhs, scope)} - ${
            compileStatement(stm.rhs, scope)
        })`,
    "math.div": (stm, scope) =>
        `(${compileStatement(stm.lhs, scope)} / ${
            compileStatement(stm.rhs, scope)
        })`,
    "group": (stm, scope) => `(${compileStatement(stm.group, scope)})`,
    "enum": (stm) => undefined,
    "flag": (stm, scope) => compileStatement(stm.body, scope),
    "match": (stm, scope) => {
        // const sub = new Scope();
        // sub.name = scope.name+"_s";
        // sub.parent = scope;
        //check if it's a void type
        const rtn_type = scope.resolveType(stm);
        if (!typeEquals(rtn_type, builtinType("void"))) {
            stm.span.errorTodo(
                "Currently you cannot return a value from a match expression",
            );
        }
        const expr_type = scope.resolveType(stm.expr);
        const expr_has_generics = expr_type.type == "withGenerics";
        const expr_inner_type = expr_type.type == "withGenerics"
            ? expr_type.value
            : expr_type;
        return `/*match statement*/{let _internal_match_expr = ${
            compileStatement(stm.expr, scope)
        };${
            stm["match-cases"].map((c) => {
                //pattern matching
                const sub_scope = new Scope(scope.registry);
                sub_scope.parent = scope;
                sub_scope.name = scope.name + "_match_sub_scope";
                // sub_scope.init(c.type=="inline"?[c.body]:c.body);
                if (c.pattern.type == "call") {
                    //enum with tuple like data
                    //the left hand side must be an enum value
                    const ty_outer = scope.resolveType(
                        c.pattern.lhs,
                        expr_type,
                    );
                    const ty = ty_outer.type == "withGenerics"
                        ? ty_outer.value
                        : ty_outer;
                    if (
                        ty.type == "enumValue" && ty.member &&
                        ty.member in ty.enum["tuple-data"]
                    ) {
                        //check if we're matching the same enum
                        if (!typeEquals(expr_inner_type, ty.enum)) {
                            c.pattern.lhs.span.errorTodo(
                                `type of this enum does not match the expected type: ${
                                    scope.typenameOf(expr_type)
                                }`,
                            );
                        }

                        const tuple_data = ty.enum["tuple-data"][ty.member];
                        const discriminator = ty.enum.discriminators[ty.member];
                        const is_null_optimise =
                            ty.enum["null-optimise-discriminator"] !==
                                undefined;
                        //validate the tuple variables
                        if (c.pattern.args.args.length != tuple_data.length) {
                            c.pattern.span.errorTodo(
                                "invalid amount of variable is this tuple enum",
                            );
                        }
                        //the tuple variables should all be identifiers
                        //TODO: maybe add Nested pattern matching
                        for (const v of c.pattern.args.args) {
                            if (v.type != "ident") {
                                v.span.errorTodo(
                                    "Constants and nested match patterns are not supported currently",
                                );
                            }
                        }
                        //add the variables to the scope
                        const var_names = c.pattern.args.args.map((e) =>
                            e.span.content()
                        );
                        //The tuple data allready contains the correct subtype
                        const var_types = tuple_data;
                        for (let i = 0; i < var_names.length; ++i) {
                            sub_scope.variables[var_names[i]] = {
                                "type": var_types[i],
                            };
                        }
                        // console.log(sub_scope.variables);
                        //compile the match arm body
                        const body = c.type == "inline"
                            ? (compileStatement(c.body, sub_scope) ?? "")
                            : compileStatements(c.body, sub_scope);
                        //compile the js variable definitions
                        let var_compiled = var_names.map((e, i) =>
                            `let ${e} = _internal_match_expr[${i + 1}]`
                        ).join(";");
                        if (is_null_optimise) {var_compiled = var_names.map(
                                (e) => `let ${e} = _internal_match_expr`
                            ).join(";");}
                        //compile the full js if-loop
                        //also check if when null pointer optimising if the enum is wrapping an integer
                        const npo_additional =
                            is_null_optimise &&
                                typeEquals(
                                    Object.values(ty.enum["tuple-data"])[0][0],
                                    builtinType("int"),
                                )
                                ? `&&isFinite(_internal_match_expr)`
                                : "";
                        if (is_null_optimise) {
                            return `if(_internal_match_expr!=null${npo_additional}){${var_compiled};${body}}`;
                        }
                        return `if(_internal_match_expr instanceof Array&&_internal_match_expr[0]==${discriminator}){${var_compiled};${body}}`;
                    } else {
                        c.pattern.span.errorTodo("unexpected pattern");
                    }
                } else if (c.pattern.type == "dot") {
                    //enum without data
                    // We must give a type hint in case this is an enum with generics
                    const ty_outer = scope.resolveType(c.pattern, expr_type);
                    const ty = ty_outer.type == "withGenerics"
                        ? ty_outer.value
                        : ty_outer;
                    if (ty.type == "enumValue" && ty.member) {
                        //check if we're matching the same enum
                        if (!typeEquals(expr_inner_type, ty.enum)) {
                            c.pattern.lhs.span.errorTodo(
                                "type of this enum does not match the expected type",
                            );
                        }
                        const discriminator = ty.enum.discriminators[ty.member];
                        const is_null_optimise =
                            ty.enum["null-optimise-discriminator"] !==
                                undefined;
                        //compile the body
                        const body = c.type == "inline"
                            ? (compileStatement(c.body, sub_scope) ?? "")
                            : compileStatements(c.body, sub_scope);
                        //compile the js if-loop
                        //also check if when null pointer optimising if the enum is wrapping an integer
                        const npo_additional =
                            is_null_optimise &&
                                typeEquals(
                                    Object.values(ty.enum["tuple-data"])[0][0],
                                    builtinType("int"),
                                )
                                ? `||!isFinite(_internal_match_expr)`
                                : "";
                        if (is_null_optimise) {
                            return `if(_internal_match_expr==null${npo_additional}){${body}}`;
                        }
                        return `if(_internal_match_expr==${discriminator}){${body}}`;
                    } else {
                        c.pattern.span.errorTodo("unexpected pattern");
                    }
                } else if (c.pattern.type == "ident") {
                    try {
                        const t = scope.resolveTypeMaybe(c.pattern);
                        //TODO: enum values could in the future be just a single ident, because of the `import EnumCase from Enum` syntax so ...
                        //in other cases treat it as an match all
                        throw "recover";
                    } catch {
                        //this failed thus the ident will catch the pattern as a variable
                        sub_scope.variables[c.pattern.span.content()] = {
                            "type": expr_type,
                        };
                        const body = c.type == "inline"
                            ? (compileStatement(c.body, sub_scope) ?? "")
                            : compileStatements(c.body, sub_scope);
                        return `if (true) {let ${c.pattern.span.content()} = _internal_match_expr;${body}}`;
                    }
                } else {
                    //what are ya matching bro...
                }
            }).join("else ")
        }}`;
    },
    "scope": (stm, scope) => {
        const sub = new Scope(scope.registry);
        sub.name = scope.name + "_s";
        sub.parent = scope;
        const body = stm.body;
        sub.init(body);
        return `{${compileStatements(body, scope)}}`;
    },

    "assign": (stm, scope) =>
        `${compileStatement(stm.lhs, scope)} = ${
            compileStatement(stm.rhs, scope)
        }`,
    "assign.add": (stm, scope) =>
        `${compileStatement(stm.lhs, scope)} += ${
            compileStatement(stm.rhs, scope)
        }`,
    "assign.sub": (stm, scope) =>
        `${compileStatement(stm.lhs, scope)} -= ${
            compileStatement(stm.rhs, scope)
        }`,
    "assign.mul": (stm, scope) =>
        `${compileStatement(stm.lhs, scope)} *= ${
            compileStatement(stm.rhs, scope)
        }`,
    "assign.div": (stm, scope) =>
        `${compileStatement(stm.lhs, scope)} /= ${
            compileStatement(stm.rhs, scope)
        }`,
    "function": (stm, scope) => {
        //TODO: allow local scope functions
        if (!scope.isModuleTop) {
            stm.span.errorTodo(
                "function can only be declared module top for now",
            );
            throw undefined;
        }
        //get som info on this function
        const fn = scope.getFunction(stm.name);
        if (fn.flag.builtin) return undefined;
        //Generic functions are compiled later
        if (fn.generics.length > 0) return undefined;

        const n = new Scope(scope.registry);

        n.name = scope.name + "_fn" + stm.name.span.content();
        n.parent = scope;
        n.requiredReturnType = fn.returnType;
        for (const e of fn.def.args) {
            n.variables[e.ident.span.content()] = {
                "type": scope.resolveTypeFromTypeStatement(e.type)!,
            };
        }
        n.init(stm.body);
        return `function ${stm.name.span.content()}(${
            stm.args.map((e) => e.ident.span.content())
        }) {${compileStatements(stm.body, n)}}`;
    },
    "await": function (
        value: AwaitStatement & { type: "await" },
        scope: Scope,
        hint?: EEType | undefined,
    ): string | undefined {
        throw new Error("Function not implemented.");
    },
    "struct": function (
        value: StructDeclarationStatement & { type: "struct" },
        scope: Scope,
        hint?: EEType | undefined,
    ): string | undefined {
        return undefined;
    },
    "struct-data": function (
        value: StructureDataStatement & { type: "struct-data" },
        scope: Scope,
        hint?: EEType | undefined,
    ): string | undefined {
        let str = "{";
        str += Object.entries(value.properties).map((e) => {
            return `${e[0]}:${compileStatement(e[1].rhs, scope)}`;
        }).join(",");
        str += "}";
        return str;
    },
};