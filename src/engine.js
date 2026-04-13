import { findEnclosures, parseKeyValues, parseSnippets, parseCommands } from './tokenizer.js';
import { callFunction, getProperty, capitalizeText, castAs } from './functions.js';

// const VAR_NAME_REGEX = /^[@]?[\$]?[\/]?[a-zA-Z_][a-zA-Z0-9_\/\.-]*$|^@$/;
//Support ? alone for using selected section and field
const VAR_NAME_REGEX = /^[@]?[\$]?[\/]?[a-zA-Z_][a-zA-Z0-9_\/\.-]*$|^@$|^\?$/;
const NUMBER_REGEX = /^-?\d+(\.\d+)?$/;

/**
 * Loom — an expression language for weaving data into text.
 *
 * Supports two modes:
 *   - render(template, vars) — find {placeholders} in text and evaluate each
 *   - evaluateText(expr, vars) — evaluate a single expression, return any type
 *
 * Also supports user-defined snippets and custom function registration.
 */
export default class Loom {
    /**
     * Create a loom with given snippets and custom functions.
     *
     * @param {Object|string} snippets - A key-value object, or a string with snippet definitions.
     * @param {Object} functions - A map of custom function names to handlers.
     */
    constructor(snippets = {}, functions = {}) {
        this.snippets = parseSnippets(snippets);
        this.functions = functions;
    }

    /**
     * Sets the template variables.
     *
     * @param {Object|function} variables - A key-value object, or a function that maps a key to a value.
     * @return {void}
     */
    setVariables(vars) {
        this.variables = typeof vars === 'function' ? vars : (key) => getProperty(key, vars);
    }

    /**
     * Finds and instantiates all the placeholders in the given text.
     *
     * @example
     * engine.render("My name is {firstName} {lastName}.")
     *
     * @param {string} template - A tex with placeholders.
     * @param {Object|function} [variables] - A key-value object, or a function that maps a key to a value.
     * @param {Map} [auxVariables] - Local variables that don't change this.variables.
     * @returns
     */
    render(template, variables = null, auxVariables = null) {
        if (variables) this.setVariables(variables);

        const tokens = findEnclosures(template, { '{': '}' });
        let result = '';

        for (const token of tokens) {
            if (token.type === 'enclosure') {
                let inner = token.value.slice(1, -1);

                // Handle the double braces (for now)
                if (inner.startsWith('{') && inner.endsWith('}')) {
                    inner = inner.slice(1, -1);
                }

                try {
                    // Evaluate the placeholder's text
                    inner = this.evaluateText(inner, null, auxVariables);

                    if (typeof inner !== 'string') {
                        inner = callFunction('#', { l: true, sep: ', ' }, [inner]);

                        if (Array.isArray(inner) && inner.every((x) => typeof x === 'string')) {
                            inner = inner.join(', ');
                        }
                    }
                } catch (e) {
                    inner = e;
                }

                result += inner;
            } else {
                result += token.value;
            }
        }

        return result;
    }

    /**
     * Evaluates a placeholder.
     *
     * @param {string} text - The placeholder's text to evaluate.
     * @param {Object|function} [variables] - A key-value object, or a function that maps a key to a value.
     * @param {Map} [auxVariables] - Local variables that don't change this.variables.
     * @returns {*} The result of evaluation the placeholder.
     */
    evaluateText(text, variables = null, auxVariables = null) {
        text = text.trim();

        if (variables) this.setVariables(variables);

        // Check the simplest and most common cases first

        if (VAR_NAME_REGEX.test(text)) {
            // A simple variable
            return this.getVariable(text, auxVariables);
        }

        return this.evaluateFunction(text, auxVariables);
    }

    evaluateList(content, auxVariables) {
        // Possible token Types are: 'text', 'enclosure', 'quote'
        const tokens = findEnclosures(
            content,
            { '(': ')', '[': ']', '{': '}' },
            { minQuoteLevel: -1, splitText: true }
        );

        if (!tokens.length) return '';

        const args = [];

        for (const token of tokens) {
            args.push(this.evaluateExpression(token, auxVariables).value);
        }

        return args;
    }

    evaluateObject(content, auxVariables) {
        // Possible token Types are: 'text', 'enclosure', 'quote'
        const tokens = findEnclosures(
            content,
            { '(': ')', '[': ']', '{': '}' },
            { minQuoteLevel: -1, splitText: true }
        );

        if (!tokens.length) return '';

        const map = parseKeyValues(tokens);
        const args = {};

        for (let [key, value] of map.entries()) {
            if (typeof key != 'string') {
                key = this.evaluateExpression(key, auxVariables).value;
            }

            value = this.evaluateExpression(value, auxVariables).value;

            args[key] = value;
        }

        return args;
    }

    parseFunction(content) {
        // Possible token Types are: 'text', 'enclosure', 'quote'
        let tokens = findEnclosures(
            content,
            { '(': ')', '[': ']', '{': '}' },
            { minQuoteLevel: -1, splitText: true }
        );

        if (!tokens.length) return {};

        tokens = parseCommands(tokens);

        let name;

        if (tokens[0].type == 'text' && tokens[0].value[0] != '-') {
            name = tokens.shift().value; // Remove first token and get its value
        } else if (tokens[0].type != 'quote' || tokens[0].value[0] == '`') {
            name = '#'; // Default to format function
        } else {
            name = '+:'; // Default to join with separator function
        }

        return { name, tokens };
    }

    evaluateFunction(content, auxVariables) {
        const { name, tokens } = this.parseFunction(content);

        if (!name) return '';

        // uniweb.log('Parsed', name, tokens);

        // For text, the name is the first element (pop it). For quote and enclosure, the name is '+:'.
        // const name = tokens[0].type == 'text' ? tokens.shift().value : '+:';
        const args = [];
        const flags = { _params: [] };

        // for (const token of tokens) {
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Convert backtick names to normalized variable names
            if (token.type == 'quote' && token.value[0] === '`') {
                token.value = token.value.slice(1, -1).toLowerCase().split(' ').join('_');
                token.type = 'text';
            }

            if (token.type == 'quote') {
                args.push(token.value.slice(1, -1));
            } else if (token.type == 'text' && token.value.startsWith('-')) {
                const opt = token.value.slice(1).split('=');

                // If the flags ends with '=', move to the next token
                if (opt[1] === '' && i + 1 < tokens.length) {
                    const nextToken = tokens[++i];
                    opt[1] = this.evaluateExpression(nextToken, auxVariables).value;
                } else if (opt[1] && opt[1][0] === '@') {
                    opt[1] = this.evaluateExpression({ value: opt[1] }, auxVariables).value;
                }

                flags[opt[0]] = opt[1] ?? true;
            } else {
                const expResult = this.evaluateExpression(token, auxVariables);

                args.push(expResult.value);

                // Track the names of variables in the arguments so we can recover their
                // localized label if we need to
                if (expResult.label) {
                    flags._params.push(token.label);
                }
            }
        }

        // Assume that it's a standard function first.
        // If the result is undefined, it means that no function was called
        const result = callFunction(name, flags, args);

        if (result !== undefined) {
            return result;
        } else if (this.snippets.hasOwnProperty(name)) {
            return this.callSnippet(name, flags, args);
        } else {
            // Try using given name and then all upper case version
            const fn =
                this.functions[name] ??
                this.functions[name.toLowerCase()] ??
                this.functions[name.toUpperCase()] ??
                false;

            return fn ? this.callCustomFunction(fn, flags, args) : this.applyFallback(name, args);
        }
    }

    callCustomFunction(fn, flags, args) {
        const evaluate = (text) => this.evaluateText(text);
        return fn.call({ evaluate }, flags, ...args);
    }

    applyFallback(name, args) {
        // Functions from Math take priority
        if (typeof Math[name] === 'function') {
            return Math[name](...args);
        }

        let target = args[0];

        const type = typeof target;

        if (type === 'object') {
            if (target === null) {
                return '';
            } else if (!Array.isArray(target)) {
                target = Object.values(target);
            }
        } else if (type !== 'string') {
            return this.getError(102, 'Invalid function name', name);
        }

        const fn = target[name] ?? target[name.toLowerCase()];

        if (typeof fn !== 'function') {
            return this.getError(104, 'Invalid function name', name);
        }

        if (args.length <= 1) return fn.call(target);

        if (type === 'string') return fn.call(target, ...args.slice(1));

        // The argument is an expression to be converted into a callback
        // const { exp, vars } = this.replaceStrings(args[1]);
        const exp = args[1];
        const vars = new Map();

        // The arguments of the callback become variables named $1, $2, ...
        return fn.call(target, (...params) => {
            for (let i = 0; i < params.length; i++) {
                vars.set('$' + (i + 1), params[i]);
            }

            return this.evaluateFunction(exp, vars);
        });
    }

    getVariableMeta(name) {
        let meta = this.variables('@' + name) || {};

        if (typeof meta == 'string') return { label: meta };

        meta.label ??= capitalizeText(name.split('_').join(' '));

        return meta;
    }

    /**
     * Evaluates an expression.
     * @param {Object} token - The expression to evaluate.
     * @param {Map} [auxVariables] - Extra environment variable values.
     * @returns {Object} The result of evaluating the expression as {value, type, label}
     */
    evaluateExpression(token, auxVariables = null) {
        const { value, type } = token;

        if (type === 'quote') {
            return { value: value.slice(1, -1), type };
        }

        if (token.type === 'enclosure') {
            if (value.startsWith('(') && value.endsWith(')')) {
                return {
                    value: this.evaluateFunction(value.slice(1, -1), auxVariables),
                    type: 'function',
                };
            }

            if (value.startsWith('[') && value.endsWith(']')) {
                return {
                    value: this.evaluateList(value.slice(1, -1), auxVariables),
                    type: 'list',
                };
            }

            if (value.startsWith('{') && value.endsWith('}')) {
                return {
                    value: this.evaluateObject(value.slice(1, -1), auxVariables),
                    type: 'object',
                };
            }
        }

        // Higher priority aux variable
        if (auxVariables && auxVariables.has(value)) {
            return { value: auxVariables.get(value), type: 'aux' };
        }

        if (VAR_NAME_REGEX.test(value)) {
            return {
                value: this.getVariable(value, auxVariables),
                label: this.getVariableMeta(value).label,
                type: 'variable',
            };
        }

        if (NUMBER_REGEX.test(value)) {
            return { value: parseFloat(value), type: 'number' };
        }

        return { value: this.getError(103, 'Invalid expression', value), type: 'error' };
    }

    getVariable(name, auxVariables = null) {
        if (name.startsWith('@')) {
            return this.getVariableMeta(name.slice(1)).label;
        }

        const value = this.variables(name);

        if (value !== undefined) {
            const meta = this.getVariableMeta(name);
            return meta.type ? castAs(value, meta.type) : value;
        } else if (auxVariables && auxVariables.has(name)) {
            return auxVariables.get(name);
        } else if (this.snippets.hasOwnProperty(name)) {
            return this.callSnippet(name);
        } else if (this.functions.hasOwnProperty(name)) {
            return this.callCustomFunction(this.functions[name], []);
        } else if (name === '_now') {
            return new Date();
        } else {
            return { true: true, false: false, null: null }[name];
            // return null;
            // return this.getError(101, 'Variable not found', name);
        }
    }

    callSnippet(name, flags = {}, args = []) {
        let fn = this.snippets[name];

        if (typeof fn !== 'function') {
            fn = this.makeSnippetFunction(fn);
            // Save the function for next time
            this.snippets[name] = fn;
        }

        return fn(flags, args);
    }

    makeSnippetFunction(snippet) {
        // Get the names of the function arguments so we can create
        // proper variables for each of them using the received arg values
        const argNames = snippet.args || [];
        const needsRender = snippet.isText;
        const body = snippet.body;
        const hasFlags = snippet.hasFlags;
        const ownVars = new Map();

        // Create a new function
        const fn = (flags, argValues) => {
            // Add the flags if they are requested
            if (hasFlags) ownVars.set('$0', flags);

            // Give proper variable names to the received arg values
            for (let i = 0; i < argValues.length; i++) {
                const argName = argNames[i] || '$' + (i + 1);

                if (argName.startsWith('...')) {
                    ownVars.set(argName.slice(3), argValues.slice(i));
                    break;
                } else {
                    ownVars.set(argName, argValues[i]);
                }
            }

            // Eval the expression with its own variables and the environment variables
            return needsRender
                ? this.render(body, null, ownVars)
                : this.evaluateFunction(body, ownVars);
        };

        return fn;
    }

    getError(code, message, arg) {
        console.error(`Error ${code}: ${message} '${arg}'`);
        // return `Error[${code}]:${arg}`;
        throw `Error[${code}][${arg}]`;
    }
}
