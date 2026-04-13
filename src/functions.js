export { callFunction, getProperty, setLocale, capitalizeText, castAs };
import { currency_code } from './currency_code.js';

/**
 * @fileoverview Utility functions grouped into Mappers, Collectors, Creators, and Selectors.
 * Each set of functions is designed to handle specific types of operations over variable
 * numbers of arguments that may each be a scalar and an array.
 */

/**
 * Defines the option flags for every CORE function. Each flag defines the expected values.
 * For example, `desc: true` means that the flag -desc expects the value true, which is the
 * default value when none is given. The special value '*' means that any value is possible.
 * Otherwise, it must be a list of possible values.
 * Note: if an option flag is mapped to a string, "X" other than '*', it means that its values
 * are the same as those of the option flag "X".
 */
const OPTIONS = {
    '>>': { prop: '*', desc: true, date: true },
    '#': {
        currency: '*',
        row: '*', // split string by | (like in a markdown table row)
        sep: '*', // separator
        wrap: '*',
        unit: 'unit',
        number: ['decimal', 'currency', 'percent', 'unit'],
        string: [],
        date: ['medium', 'full', 'long', 'short', 'year', 'ym', 'auto'],
        list: [],
        object: [],
        json: [],
        debug: [],
        range: ['open'],
        text: 'string', // Alias to string
        map: 'object', // Alias to object
        tag: [
            'bold',
            'italic',
            'underline',
            'strikethrough',
            'superscript',
            'subscript',
            'span',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
        ],
    },
};

/**
 * Core functions of Unilang.
 */
const FUNCTIONS = {
    accessor: {
        '': { handler: applyAccessor, minArgs: 2, spread: false }, // handler
        '.': dotAccessor,
    },
    collector: {
        '': applyCollector, // handler
        '++': add, // add, concat, merge
        '++!!': countItems,
    },
    creator: {
        '': { handler: applyCreator, spread: false }, //applyCreator, // handler
        '^': createMatrix,
        '~': createRange,
        '\\': createRegex, // Single backslash \ escaped
        '@': createLocalizable,
        '<>': createCode,
        phone: createPhoneNumber,
        address: createAddress,
        org: createOrganization,
        ref: createRef,
        currency: createCurrency,
        email: createEmail,
    },
    filter: {
        '': applyFilter, // handler
        '&': logicalAnd, // !!&
        '|': logicalOr, // !!|
        '|=': contains, // (|= val set) same as (| (= val set))
        '|?': firstMatch, // (|? COND val) same as (| (? COND val))
        '&?': lastMatch,
        '+?': joinIfAllTrue, // or maybe &&
    },
    formatter: {
        '': { handler: applyFormatter, minArgs: 1, spread: false }, // handler
        '#': formatValue,
        '!': logicalNot,
        '!!': logicalNotNot, // same as (! (! val))
    },
    joiner: {
        '': { handler: applyJoiner, minArgs: 2, spread: true }, // handler
        '+-': joinWithSeparator,
        '+:': joinWithSeparator, // new name
    },
    mapper: {
        '': { handler: applyMapper, minArgs: 2, spread: true }, // handler
        '+': add, // add, prefix, suffix
        '-': subtract,
        '%': percentage,
        '*': multiply,
        '/': divide,
        '>': greaterThan,
        '<': lessThan,
        '>=': greaterThanOrEqual,
        '<=': lessThanOrEqual,
        '=': equalLoose,
        '==': equalStrict,
        '!=': notEqualLoose,
        '!==': notEqualStrict,
    },
    sorter: {
        '': applySorter, // handlers
        '>>': sortValues,
    },
    switcher: {
        '': applySwitcher, // handlers
        '?': switchCase,
        '??': switchCase, // same as ? with no arguments, but can filter several args
        '???': switchCase,
        '?:': switchCase,
    },
};

const NON_CASCADING_FLAGS = ['wrap', 'aux', 'label', 'heading', 'title'];

/**
 * Module variable used by setLocale() and getLocale().
 * @remarks: It should not be used directly!
 */
let CURRENT_LOCALE;

const CACHED = {};

//#region Main

function callFunction(name, flags, args) {
    CACHED[name] ??= getFunctionDetails(name);

    const info = CACHED[name];

    if (!info) return undefined;

    if (args.length < info.minArgs) return null;

    // If the last argument is an array, and it is the last of the minimum number of
    // arguments, then take it as a spread array.
    if (
        ((info.spread && args.length == info.minArgs && !flags.l) || flags.s) &&
        isArray(args[args.length - 1])
    ) {
        const lastArg = args.pop();
        args = args.concat(lastArg);
    }

    let options = OPTIONS[name] || [];
    // Assign option values to option types. Eg, -y implies -x=y
    for (let propName in options) {
        const valid = options[propName];

        if (isArray(valid)) {
            // Derive properties from values
            for (const value of valid) {
                if (value in flags) {
                    if (!flags[propName])
                        flags[propName] = value; // eg, currency=usd => number=currency
                    else {
                        flags[propName] = [...[flags[propName]], value];
                    }

                    // flags[propName] = value;
                    flags.type = propName;
                    flags.style = value;
                    continue;
                }
            }
        }
        // else if (valid !== '*' && propName in flags && flags[propName] != valid) {
        //     console.warn(`Invalid flag '-${propName}=${flags[propName]}'. Expecting: ${valid}`);
        // }
    }

    if (!flags.type && typeof flags.as == 'string') {
        flags.type = flags.as;
    }

    if (flags.lang) {
        flags.locale = flags.lang;
    } else {
        if (!flags.locale) {
            flags.locale = getLocale(flags.locale);
        }
        flags.lang = getLanguageCode(flags.locale);
    }

    flags._name = name;

    const result = info.handler(info.fn, flags, args);

    if (flags.r && isArray(result)) {
        result.reverse();
    }

    // Don't return undefined because that means that no function was called
    return result === undefined ? null : result;
}

// function interpretCategory(categoryName) {
//     const parts = categoryName.split('-');
//     const handlerKey = parts[0]; // 'mapper' or 'collector'
//     const handler = HANDLERS[handlerKey];

//     if (!handler) {
//         throw new Error(`Handler for '${handlerKey}' not found`);
//     }

//     const argTypes = parts.slice(1);
//     const stepIn = [];

//     for (let type of argTypes) {
//         // If the type is not "any", step into lists
//         // looking for elements. "any" is the only "type"
//         // that considers whole lists as elements.
//         stepIn.push(type === 'plain');
//     }

//     return {
//         handler,
//         config: {
//             argTypes, // for castAs()
//             stepIn, // Flatten or spread when arg is plain
//         },
//     };
// }

function getFunctionDetails(name) {
    for (let categoryKey in FUNCTIONS) {
        const category = FUNCTIONS[categoryKey];

        if (category.hasOwnProperty(name)) {
            // const info = interpretCategory(categoryKey);
            let info = category[''];

            // If info is a handler function, set the info props
            // to their default values
            if (typeof info == 'function') {
                info = { handler: info, minArgs: 1, spread: true };
            } else if (isObject(info)) {
                info = { ...info };
            }

            info.fn = category[name];

            // const info = {
            //     // handler: HANDLERS[categoryKey],
            //     handler: category[''],
            //     fn: category[name],
            // };

            // info.fn = category[name];

            // const options = OPTIONS[name];

            // // Deal with aliases
            // for (const opt in options) {
            //     if (isString(options[opt]) && options[opt] in options) {
            //         options[opt] = options[options[opt]];
            //     }
            // }

            // info.config.options = options;

            return info;
        }
    }

    return false;
}

// /**
//  * Finds or creates an arrow function for the requested function name.
//  * @param {string} name - The name of a function.
//  * @returns {function|null} An arrow function or null.
//  */
// function getFunction(name) {
//     if (CACHED.hasOwnProperty(name)) {
//         return CACHED[name];
//     }

//     const info = getFunctionDetails(name);

//     if (!info) {
//         return (CACHED[name] = null);
//     }

//     return (CACHED[name] = (flags, args) => info.handler(info.fn, flags, args, info.config));
// }

/**
 *
 * @namespace Accessors
 * @description
 */

/**
 * Calls functions to access properties.
 *
 * It takes a function `fn` and the collected `args`. It assumes that the first
 * argument is the `condition`. If the `condition` is not an array, it directly
 * applies the selector function `fn` to the condition and the remaining arguments.
 * If the `condition` is an array, it maps over each condition and selects the
 * corresponding arguments from the remaining arguments, applying the selector
 * function `fn` to each set of selected arguments.
 * MARK: Accessors
 * @param {function} fn - The function to call.
 * @param {Array} args - The arguments to pass to the function
 * @returns {*} The result of calling the given function with the given arguments.
 */
function applyAccessor(fn, flags, args) {
    const condition = args[0];
    const rest = args.slice(1);

    if (!rest.length) return condition;

    if (isObject(condition)) {
        if (rest.length > 1 || isArray(rest[0])) {
            const items = rest.length == 1 ? rest[0] : rest;
            const result = [];

            for (const item of items) {
                result.push(fn(condition, item));
            }

            return result;
        } else {
            // Length 1 and first element is not an array
            return fn(condition, rest[0]);
        }
    } else if (rest.length == 1) {
        return fn(condition, rest[0]);
    } else {
        return fn(condition, rest);
    }

    // if (/*!config.stepIn[0] ||*/ true || !isArray(condition)) {
    //     if (rest.length == 1) {
    //         // if (isArray(rest[0]) && config.stepIn[1]) {
    //         //     return rest[0].map((arg) => fn(condition, arg));
    //         // } else {
    //         return fn(condition, rest[0]);
    //         // }
    //     } else {
    //         return rest.map((arg) => fn(condition, arg));
    //     }
    // } else {
    //     // Map each condition onto each argument
    //     return condition.map((cond, index) => {
    //         const selectedArgs = rest.map((arg) => (Array.isArray(arg) ? arg[index] : arg));

    //         return fn(cond, ...selectedArgs);
    //     });
    // }
}

function dotAccessor(props, obj) {
    if (isNumber(props)) {
        props = props.toString();
    }

    if (isString(props)) {
        return getProperty(props, obj);
    }

    if (isArray(props)) {
        const result = {};
        for (const prop of props) {
            result[prop] = getProperty(prop, obj);
        }
        return result;
    }

    if (isObject(props)) {
        const result = {};
        for (const prop in props) {
            result[props[prop]] = getProperty(prop, obj);
        }
        return result;
    }

    // // Helper function to handle dot notation for nested properties
    // function resolvePath(path, obj) {
    //     return path
    //         .toString()
    //         .split('.')
    //         .reduce((acc, part) => acc && acc[part], obj);
    // }
    // // Handle different types of props input: array, string, or object for renaming
    // if (Array.isArray(props)) {
    //     const result = props.reduce((acc, prop) => {
    //         const value = resolvePath(prop, obj);
    //         if (value !== undefined) {
    //             acc[prop] = value;
    //         }
    //         return acc;
    //     }, {});
    //     return Object.keys(result).length > 0 ? result : null;
    // } else if (isObject(props)) {
    //     const result = Object.keys(props).reduce((acc, prop) => {
    //         const value = resolvePath(prop, obj);
    //         const newName = props[prop];
    //         if (value !== undefined) {
    //             acc[newName] = value;
    //         }
    //         return acc;
    //     }, {});
    //     return Object.keys(result).length > 0 ? result : null;
    // } else {
    //     // Single string property
    //     return resolvePath(props, obj);
    // }
}

/**
 * Calls functions designed to create new objects, ranges, or patterns.
 * It simply spreads the `args` and passes them to the creator function `fn`.
 * MARK: Creators
 * @param {function} fn - The function to call.
 * @param {Array} args - The arguments to pass to the function
 * @returns {*} The result of calling the given function with the given arguments.
 */
function applyCreator(fn, flags, args) {
    //Prove of concept to handle matrix creation

    if (['~', 'phone', 'address', 'ref', 'email'].includes(flags._name) && hasArrays(args)) {
        let matrix = createMatrix(flags, args);

        //Filter out invalid items in the matrix
        if (flags._name === 'phone') {
            matrix = matrix.filter((item) => item[0]);
        }

        return matrix.map((row) => fn(flags, row));
    }

    return fn(flags, args);
}

/**
 * Determine the length of the longest array in the given arrays.
 * @param {Array} arrays - The arrays to consider.
 * @returns {number} The maximum length found.
 */
function getMaxLength(arrays) {
    return Math.max(...arrays.map((elem) => (Array.isArray(elem) ? elem.length : 1)));
}

/**
 * Creates a normalized matrix from an array of potentially sparse data. Each element of the input is either expanded or padded
 * to create a uniform matrix where all inner arrays are of the same length. Non-array elements are expanded into arrays of
 * the specified length, and arrays shorter than the specified length are padded with the specified default value.
 *
 * @param {number|Object} flags - The array containing either values or arrays of values.
 * @param {number} flags.sz - The desired min length for all inner arrays in the matrix (column size).
 * @param {any} flags.t - Whether to transpose the resulting rows and columns.
 * @param {any} flags.dv - The default value to use for padding missing entries (defaults to 'null').
 * @param {Array<any>} data - The array containing either values or arrays of values (seen as columns).
 * @returns {Array<Array<any>>} - A matrix where each row is of uniform length.
 *
 * @example
 * createMatrix(0, [1, [2, 3], 4], 3);
 * // Output: [[1, 1, 1], [2, 3, 0], [4, 4, 4]]
 */
function createMatrix(flags, data) {
    // const size = Math.max(parseInt(flags.sz) || 0, getMaxLength(data));
    const size = parseInt(flags.sz) || getMaxLength(data);

    let defaultValue = flags.dv ?? null; // better than undefined

    if (defaultValue !== null) {
        defaultValue = castAs(defaultValue, inferType(defaultValue));
    }

    const matrix = [];

    for (const item of data) {
        if (!Array.isArray(item)) {
            matrix.push(Array(size).fill(item));
        } else if (size > item.length) {
            // Fill empty slots in sparse arrays with the given value
            matrix.push([...item, ...Array(size - item.length).fill(defaultValue)]);
        } else if (size < item.length) {
            matrix.push(item.slice(0, size));
        } else {
            matrix.push(item);
        }
    }

    // The matrix is "transposed" by default, so "-t" cancels it out
    return flags.t ? matrix : transposeMatrix(matrix);
}

/**
 * Transposes a given matrix, swapping its rows and columns.
 *
 * @param {Array<Array<any>>} matrix - The matrix to be transposed.
 * @returns {Array<Array<any>>} - A new matrix with the rows and columns of the original matrix swapped.
 */
function transposeMatrix(matrix) {
    // Create a new matrix with the number of rows equal to the number of columns in the original
    const transposed = [];

    // Assume all rows in the original matrix are of equal length
    if (matrix.length === 0) {
        return transposed;
    }

    for (let col = 0; col < matrix[0].length; col++) {
        const newRow = [];
        for (let row = 0; row < matrix.length; row++) {
            newRow.push(matrix[row][col]);
        }
        transposed.push(newRow);
    }

    return transposed;
}

function createRange(flags, args) {
    // Creates an array representing a range of numbers from start to end
    // return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    return new Range(flags, args);
}

function createRegex(flags, pattern) {
    return new RegExp(pattern, flags); // Creates a new regular expression
}

function createLocalizable(flags, args) {
    return new Localizable(flags, args); // Creates a new regular expression
}

function createCode(flags, args) {
    return new Code(flags, args); // Creates a html code
}

function createPhoneNumber(flags, args) {
    return new PhoneNumber(flags, args);
}

function createAddress(flags, args) {
    return new Address(flags, args);
}

function createOrganization(flags, args) {
    return new Organization(flags, args);
}

function createRef(flags, args) {
    return new RefEntity(flags, args);
}

function createCurrency(flags, args) {
    return new Currency(flags, args);
}

function createEmail(flags, args) {
    return new Email(flags, args);
}

/**
 * Calls functions designed to gather multiple inputs and compile them into a more
 * organized or simplified format. Whether it's combining an array of numbers into a single
 * sum, concatenating strings into a comprehensive sentence, or compiling data points into a
 * structured report, collectors streamline complex sets of data into more manageable outputs.
 * MARK: Collectors
 */
function applyCollector(fn, flags, args) {
    const list = flatten(args);

    return list.length ? list.reduce(fn) : '';
}

function subtract(a, b) {
    if (isNumber(a) && isNumber(b)) return a - b;

    if (isString(a) && isString(b)) {
        if (a.length >= b.length) {
            if (a.endsWith(b)) return a.slice(0, -b.length);
        } else {
            if (b.startsWith(a)) return b.slice(a.length);
        }

        return a;
    }

    return null; // consider arrays and property deletion
}

function percentage(total, portion) {
    return (portion / total) * 100; // Calculates what percentage 'portion' is of 'total'
}

function multiply(a, b) {
    return a * b;
}

function divide(a, b) {
    if (isNumber(a) && isNumber(b)) return a / b;

    // if (isString(a) && isString(b)) return a.split(b);

    return a.toString().split(b.toString());
}

function add(a, b) {
    // if (isNumber(a) && isNumber(b)) {
    //     a = castAs(a, 'number');
    //     b = castAs(b, 'number');
    // } else {

    // }

    return a + b;
}

/**
 * Function to check if given value is in the given set. For Range type objects, it checks if the value is within the range.
 * @param {*} arg [value, set]
 */
function contains(arg) {
    const [value, set] = arg;

    if (value && set) {
        if (set instanceof Range) {
            return set.contains(value);
        }
    }

    return false;
}

// function filterEmpties(arg, set) {}

function firstMatch(arg, set) {}

function lastMatch(arg, set) {}

/**
 * Joins strings with separators.
 *
 * @param {Object} flags -
 * @param {Array} items - The items to be flattened and joined.
 * @returns {string} The joined items.
 */
function joinWithSeparator(flags, args) {
    const separator = args[0]?.toString();
    let items = args.slice(1);

    items = flatten(items);

    if (isString(separator)) {
        const filteredItems = items.filter((item) => !isEmpty(item) || item === 0);

        return filteredItems.join(separator);
    } else if (isArray(separator)) {
        const separators = separator.length ? separator : [''];

        // Join the items with the separators
        let joinedItem = items.reduce((acc, item, index) => {
            if (!item && item !== 0) return '';
            if (index === 0) return item;

            const sep = separators[Math.min(index - 1, separators.length - 1)];
            return acc + sep + item;
        }, '');

        return joinedItem;
    }

    return '';
}

function joinIfAllTrue(args) {
    return args.every((item) => !isEmpty(item) || item === 0)
        ? joinWithSeparator({}, ['', ...args])
        : '';
}

function countItems(a, b) {
    return isEmpty(b) ? a : a + 1;
}

/**
 * Flattens a given value recursively. If the value is an array, it flattens all nested arrays. If the value is an
 * object, it extracts the object's values into an array and then flattens any nested arrays within those values.
 * If the value is neither an array nor an object, it returns an array containing the original value.
 *
 * @param {any} value - The value to be flattened, which can be an array, an object, or any other type.
 * @returns {Array} - The flattened array if the input is an array or an object (including null); otherwise,
 * an array containing the original value.
 */
function flatten(value) {
    // If it's an array, flatten it including all nested arrays
    if (isArray(value)) {
        return value.flat(Infinity);
    }

    // If it's null, it becomes the empty array
    if (value === null || value === undefined) {
        return [];
    }

    // If it's an object (and not null), extract its values, and flatten any nested arrays
    if (typeof value === 'object') {
        return Object.values(value).flat(Infinity);
    }

    // Return an array containing the value if it's neither an array nor an object
    return [value];
}

/**
 * Calls functions that reduce their input to a subset.
 * Similar to a conditional selector but without a conditions, each whole row
 * of arguments itself is used as the condition.
 * MARK: Filters
 * @param {*} fn
 * @param {*} args
 * @returns
 */
function applyFilter(fn, flags, args) {
    if (!hasArrays(args)) {
        return fn(args);
    }

    const matrix = createMatrix({}, args);
    const result = [];

    for (let i = 0; i < matrix.length; i++) {
        result.push(fn(matrix[i]));
    }

    return result;
}

function logicalAnd(args) {
    // let lastNonEmpty = null;

    // Iterate through each condition to find the first true condition
    for (let i = 0; i < args.length; i++) {
        if (isEmpty(args[i])) return args[i];

        // lastNonEmpty = args[i];
    }

    return args[args.length - 1];
}

function logicalOr(args) {
    // Iterate through each condition to find the first true condition
    for (let i = 0; i < args.length; i++) {
        if (!isEmpty(args[i])) {
            // Return the corresponding case if the condition is true
            return args[i];
        }
    }

    return null;
}

/**
 * Calls functions designed to transform inputs based on specific rules or criteria.
 *
 * Maps the first arguments onto the rest, one at a time.
 *
 * MARK: Mappers
 * @param {function} fn - The function to call.
 * @param {Array} args - The arguments to pass to the function
 * @returns {*} The result of calling the given function with the given arguments.
 */
function applyMapper(fn, flags, args) {
    const domain = args[0];
    const codomain = args.slice(1);
    let result;

    if (/*config.stepIn[0] &&*/ Array.isArray(domain)) {
        // If domain is an array and should treat its elements individually
        result = domain.map((d) => mapDomainOntoCodomain(fn, d, codomain));
    } else {
        // Process normally when domain is a single element or as a whole array
        result = mapDomainOntoCodomain(fn, domain, codomain);
    }

    return result;
}

/**
 * Calls functions designed to format their inputs based on specific rules or criteria.
 *
 * MARK: Formatter
 * @param {function} fn - The function to call.
 * @param {Array} args - The arguments to pass to the function
 * @returns {*} The result of calling the given function with the given arguments.
 */
function applyFormatter(fn, flags, args) {
    const formatItem = (args) => {
        if (args.length == 1) {
            return fn(flags, args[0]);
        }

        return args.map((c) => fn(flags, c));
    };

    if (!hasArrays(args)) {
        return formatItem(args);
    }

    const matrix = createMatrix({}, args);

    return matrix.map((item) => {
        return formatItem(item);
    });
}

/**
 * Calls functions designed to join their inputs based on specific rules or criteria.
 *
 * MARK: Joiner
 * @param {function} fn - The function to call.
 * @param {Array} args - The arguments to pass to the function
 * @returns {*} The result of calling the given function with the given arguments.
 */
function applyJoiner(fn, flags, args) {
    if (!hasArrays(args)) {
        return fn(flags, args);
    }

    // Determine the maximum length to normalize arrays
    const matrix = createMatrix({}, args);

    const result = [];

    for (let i = 0; i < matrix.length; i++) {
        result.push(fn(flags, matrix[i]));
    }

    return result;

    // if (args.length == 1) {
    //     return fn(flags, args[0]);
    // }

    // return args.map((c) => fn(flags, c));
}

/**
 * Handles 2 sub-cases of the 2 cases handled by applyMapper().
 *
 * @param {*} fn
 * @param {*} domain
 * @param {*} codomain
 * @returns
 */
function mapDomainOntoCodomain(fn, domain, codomain) {
    if (codomain.length == 1 && !isArray(codomain[0])) {
        return fn(domain, codomain[0]);
    }

    if (codomain.length == 1 && isArray(codomain[0])) {
        codomain = codomain[0];
    }

    return codomain.map((c) => {
        if (Array.isArray(c)) {
            // Process each element in the codomain array with the domain
            return c.map((subC) => fn(domain, subC));
        } else {
            // Process the single codomain element with the domain
            return fn(domain, c);
        }
    });
}

function parseRow(value, indices) {
    if (!value) return [];

    value = Array.isArray(value) ? value : value.split('|');

    if (isString(indices)) {
        indices = indices.split(',');
    }

    if (!isNumberArray(indices)) {
        return value;
    }

    const selected = [];

    for (const idx of indices) {
        selected.push(value[idx]);
    }

    return selected;
}
/**
 * Format and localize a date or number value.
 *
 * @param {string|number} value - A date or a number to format.
 * @param {Object?} flags - A explicit type: 'date', 'number'. It can also
 * contain a format string, like 'date:short' or 'number:currency'. An optional
 * format to pass down to the JS localization methods. Eg string: 'currency: USD, style: currency'
 * @returns {string} The formatted value.
 */
function formatValue(flags, value) {
    flags.type ??= inferType(value, flags);

    // If table row string with cells separated by |
    if (flags.row) {
        value = parseRow(value, flags.row);
        flags.type = 'list';
    } else {
        // Make sure that the value is of the declared type
        value = castAs(value, flags.type, flags);
    }

    if (value === null) return '';

    const ownType = flags.json ? 'json' : flags.type;

    // have some logic to generate flags that are passed down to the formatByType
    const pssedDownFlags = { ...flags };

    // Remove non-cascading flags
    NON_CASCADING_FLAGS.forEach((flag) => {
        delete pssedDownFlags[flag];
    });

    const typeFlags = { ...pssedDownFlags, [flags.type]: flags[flags.type] } || {};

    // Format the value based on its type, it seems always to be a string,
    // We should put any non-string preprossing before this point.
    value = formatByType(ownType, typeFlags, value);

    // if (flags.sep && isArray(value)) {
    //     value = value.join(flags.sep);
    // }

    if (flags.title && isString(value)) {
        value = capitalizeText(value, flags.locale);
    }

    if (flags.aux) {
        if (isArray(value)) value = value.join(flags.sep || ', ');

        value = buildAux(flags, value);
    }

    if (flags.label) {
        if (isArray(value)) value = value.join(flags.sep || ', ');
        if (flags.label === true) flags.label = flags._params[0];

        value = buildInlineValueGroup(flags, value);
    }

    if (flags.heading) {
        if (isArray(value)) value = value.join(flags.sep || ', ');
        if (flags.heading === true) flags.heading = flags._params[0];

        value = buildValueGroup(flags, value);
    }

    if (flags.wrap) {
        if (isEmpty(value)) {
            value = '';
        } else {
            if (flags.wrap === true) flags.wrap = '()';
            value = flags.wrap[0] + value + flags.wrap[1];
        }
    }

    return value;
}

function formatByType(type, flags, value) {
    switch (type) {
        case 'null':
            return '';
        case 'entity':
            return value.format(flags);
        case 'date':
            return formatDate(flags, value);
        case 'number':
            return formatNumber(flags, value);
        case 'text':
        case 'string':
            return formatText(flags, value);
        case 'object':
            return formatObject(flags, value);
        case 'json':
            return JSON.stringify(value);
        case 'list':
            return formatList(flags, value);
        case 'boolean':
            return value ? '1' : '0';
        default:
            if (value) {
                return value?.toString() || '';
            } else {
                //Only send warning when there is value
                console.warn(`Cannot format type: ${flags.type} for the value ${value}`);

                return '';
            }
    }
}

function greaterThan(a, b) {
    return a > b;
}

function lessThan(a, b) {
    return a < b;
}

function greaterThanOrEqual(a, b) {
    return a >= b;
}

function lessThanOrEqual(a, b) {
    return a <= b;
}

/**
 * It converts the operands to the same type before making the comparison.
 * It will consider values equal if they are coercible to the same value,
 * even if they are of different types.
 * @example
 * 0 == '0'       // true, because '0' is coercible to 0
 * '1' === true    // true, because '1' and true both coerce to 1
 */
function equalLoose(a, b) {
    return a == b; // Loose equality checks
}

function equalStrict(a, b) {
    return a === b; // Strict equality checks
}

/**
 * It converts the operands to the same type before making the comparison.
 * It will consider values equal if they are coercible to the same value,
 * even if they are of different types.
 * @example
 * 0 != '0'       // false, because '0' is coercible to 0
 * '1' != true    // false, because '1' and true both coerce to 1
 */
function notEqualLoose(a, b) {
    return a != b;
}

function notEqualStrict(a, b) {
    return a !== b;
}

function logicalNot(flags, value) {
    return !value; // Logical NOT operation
}

function logicalNotNot(flags, value) {
    return !!value; // Logical NOT operation
}

/**
 * Calls functions designed to compare rows.
 * MARK: Sorter
 */
function applySorter(fn, flags, args) {
    if (!hasArrays(args)) {
        return fn(flags, args);
    }

    // Determine the maximum length to normalize arrays
    const matrix = createMatrix({}, args);
    const result = [];

    for (let i = 0; i < matrix.length; i++) {
        result.push(fn(flags, matrix[i]));
    }

    return result;
}

/**
 * Sorts in ascending or descending order.
 * @param {*} args
 */
function sortValues(flags, args) {
    const fn = flags.date ? sortDateValues : sortMixedTypeValues;
    const dir = flags.desc ? -1 : 1;

    return args.sort((a, b) => dir * fn(flags, a, b));
}

function sortDateValues(flags, a, b) {
    let aValue = getFirstValue(a);
    let bValue = getFirstValue(b);

    if (isDate(aValue) && isDate(bValue)) {
        return castAs(aValue, 'date').getTime() - castAs(bValue, 'date').getTime();
    } else {
        return sortMixedTypeValues(flags, a, b);
    }
}

/**
 * Handles the sorting of an array of objects based on a property that might
 * contain mixed types (numbers as integers, floats, or strings, and non-numeric strings).
 * It properly handles diacritics by using String.localeCompare().
 * @param {*} a
 * @param {*} b
 * @returns
 */
function sortMixedTypeValues(flags, a, b) {
    let aValue = getFirstValue(a);
    let bValue = getFirstValue(b);
    const isNumberA = isNumber(aValue);
    const isNumberB = isNumber(bValue);

    if (isNumberA && isNumberB) {
        return Number(aValue) - Number(bValue);
    } else if (!isNumberA && !isNumberB) {
        if (typeof aValue !== 'string') aValue = String(aValue);
        if (typeof bValue !== 'string') bValue = String(bValue);
        return aValue.localeCompare(bValue, flags.locale); //{ sensitivity: 'variant' }
    } else {
        return isNumberA ? -1 : 1;
    }
}

function getFirstValue(input) {
    if (isArray(input)) {
        // Handle the case when the input is an array
        return input[0];
    } else if (input instanceof Map) {
        // Handle the case when the input is a Map
        return input.values().next().value;
    } else if (isObject(input)) {
        // Handle the case when the input is an object
        const keys = Object.keys(input);
        return input[keys[0]];
    } else {
        // Return the input itself if it is not an array, an object, or a Map
        return input;
    }
}

/**
 * Calls functions for selecting or filtering data based on conditions.
 *
 * It treats the first argument of the condition that determines which of the other
 * arguments is selected. It works on rows of arguments.
 * MARK: Switchers
 *
 * @param {*} fn
 * @param {*} args
 * @returns
 */
function applySwitcher(fn, flags, args) {
    let conditions = [];
    let cases = [];

    if (flags._name === '?:') {
        conditions = args;
        cases = args;
    } else {
        let numConditions = parseInt(flags.cases);

        if (!numConditions) {
            numConditions = { '??': 2, '???': 3 }[flags._name] || 1;
        }

        if (numConditions >= args.length) {
            return null;
        }

        conditions = args.slice(0, numConditions);
        cases = args.slice(numConditions);
    }

    // let conditions = args.slice(0, numConditions);
    // let cases = args.slice(numConditions);

    // if (flags._name === '?:') {
    //     conditions = args;
    //     cases = args;
    // }

    // Simple case with not array arguments
    if (!hasArrays(conditions) && !hasArrays(cases)) {
        return fn(flags, conditions, cases);
    } else {
        const size = Math.max(getMaxLength(conditions), getMaxLength(cases));
        const matOpts = { sz: size };

        // Normalize conditions and cases using createMatrix
        const condMatrix = createMatrix(matOpts, conditions);
        const caseMatrix = createMatrix(matOpts, cases);

        const result = [];

        for (let i = 0; i < size; i++) {
            result.push(fn(flags, condMatrix[i], caseMatrix[i]));
        }

        return result;
    }

    // // If it is filter mode
    // if (numCases == 0) {
    //     if (conditions.length == 1 || isArray(conditions[0])) {
    //         const filtered = [];

    //         for (const item of conditions[0]) {
    //             if (!isEmpty(item)) filtered.push(item);
    //         }

    //         return filtered;
    //     } else {
    //         return isEmpty(conditions[0]) ? null : conditions[0];
    //     }
    // } else if (numCases > 0) {
    //     if (hasArrays(cases) && !flags.list) {
    //         cases = createMatrix({ t: true }, cases);
    //     }
    // }

    // // Base case
    // if (!hasArrays(conditions)) {
    //     return fn(flags, conditions, cases);
    // }
    // // Determine the maximum length to normalize arrays
    // const maxLength = getMaxLength(conditions);
    // const matOpts = { sz: maxLength };

    // // Normalize conditions and cases using createMatrix
    // const condMatrix = createMatrix(matOpts, conditions);
    // const caseMatrix = createMatrix(matOpts, cases);

    // const result = [];

    // for (let i = 0; i < maxLength; i++) {
    //     result.push(fn(flags, condMatrix[i], caseMatrix[i]));
    // }

    // return result;
}

/**
 * Evaluates a series of conditions and returns the corresponding outcome for the first true condition.
 * If all conditions are false, it returns an optional "else" case if provided. This function accepts
 * both a single condition or an array of conditions.
 *
 * @param {Object} flags - user-provided options flags.
 * @param {Array|any} conditions - A single condition or an array of conditions to evaluate.
 *                                 Each condition is checked in order until one evaluates to true.
 * @param {Array} cases - An array of outcomes corresponding to each condition. There should be
 *                        at least as many cases as there are conditions, with an optional additional
 *                        case serving as the default "else" outcome.
 * @returns {any} - The outcome associated with the first condition that evaluates to true, the "else" case
 *                  if provided and no conditions are true, or `undefined` if no conditions are true and no
 *                  "else" case is provided.
 */
function switchCase(flags, conditions, cases) {
    // Ensure conditions is always an array
    // if (!isArray(conditions)) {
    //     conditions = [conditions];
    //     if (!cases.length) cases = conditions;
    // }

    // Iterate through each condition to find the first true condition
    for (let i = 0; i < conditions.length; i++) {
        if (!isEmpty(conditions[i])) {
            // Return the corresponding case if the condition is true
            return cases[i];
        }
    }

    // If no condition was true and there is an "else" case, return it
    if (cases.length > conditions.length) {
        return cases[conditions.length];
    }

    // If there's no "else" case, return undefined
    return null;
}

function isZero(value) {
    return value === 0 || value === '0';
}

function isEmpty(value) {
    // Check for falsy values which covers undefined, null, false, 0, NaN, and ""
    if (!value || value === '0') {
        return true;
    }

    // Check if it's an array and empty
    if (Array.isArray(value)) {
        return value.length === 0;
    }

    if (value instanceof BaseEntity && typeof value.isEmpty === 'function' && value.isEmpty()) {
        return true;
    }

    // Check if it's an object (not null, array, etc.) and empty
    if (typeof value === 'object' && value.constructor === Object) {
        return Object.keys(value).length === 0;
    }

    return false; // If none of the above, it's not considered empty
}

/**
 * MARK: Types
 * @namespace Types
 * @description Functions that handle types and their properties.
 */

/**
 * Retrieves a value from a nested data structure (object, array, Map) based on a string path.
 *
 * @param {string} path - The dot-separated path (e.g., 'a.b.c') to the desired value.
 * @param {Object|Array|Map} value - The data structure from which to retrieve the value.
 * @returns {*} The value located at the specified path, or undefined if the path is not valid.
 *
 * The function seamlessly navigates through nested objects, arrays, and Maps. Each segment of the
 * path is considered either a property name of an object, an index of an array, or a key of a Map.
 * If any segment of the path is undefined or does not lead to a valid data structure, the function
 * returns undefined.
 */
function getProperty(path, value) {
    const keys = path.split('.');
    let current = value;

    for (let i = 0; i < keys.length; i++) {
        let key = keys[i];

        // Skip arrays for .. notation
        // (key === '')
        if (isArray(current) && !isNumber(key)) {
            const list = [];
            for (let elem of current) {
                // key = keys.slice(i + 1).join('.');
                key = keys.slice(i).join('.');
                list.push(getProperty(key, elem));
            }

            return list;
        }

        // Give priority to the common cases
        if (current === null) {
            return undefined;
        } else if (typeof current === 'object') {
            if (current.hasOwnProperty(key)) {
                current = current[key]; // May be undefined
            } else {
                key = keys.slice(i).join('.');
                return current.hasOwnProperty(key) ? current[key] : undefined;
            }
        } else if (current instanceof Map) {
            current = current.get(key); // May be undefined
        } else {
            // Return undefined if the current part is not a valid container
            return undefined;
        }

        // Stop if the current part becomes undefined, indicating a broken path
        if (current === undefined) {
            return undefined;
        }
    }

    return current;
}

function isObject(value) {
    return value !== null && typeof value === 'object';
}

function isString(value) {
    return typeof value === 'string';
}

function isArray(value) {
    return Array.isArray(value);
}

// function isArrayInArray(value) {
//     if (isArray(value)) {
//         for (let v of value) {
//             if (isArray(v)) {
//                 return true;
//             }
//         }
//     }

//     return false;
// }

function isNumberArray(items) {
    if (!isArray(items) || !items.length) return false;

    for (const it of items) {
        if (!isNumber(it)) return false;
    }

    return true;
}

function hasArrays(array) {
    for (let elem of array) {
        if (isArray(elem)) return true;
    }
    return false;
}

function isNumber(value) {
    // return !isNaN(parseFloat(value)) && isFinite(value);
    return !isNaN(Number(value));
}

function isDate(value) {
    if (!value) return false;

    if (value instanceof Date) return true;

    if (typeof value !== 'string') return false;

    return !isNaN(new Date(value).getTime());
}

function isIncompleteDate(value) {
    if (!isDate(value)) return false;

    const regex = /^\d{4}\/\d{1,2}\/\d{1,2}$/;

    return !regex.test(value);
}

function castAs(value, type, flags = {}) {
    switch (type) {
        case 'boolean':
            return !isEmpty(value);
        case 'date': {
            if (!isDate(value)) return null;
            if (value instanceof Date) return value;
            if (flags.date === 'auto' && isIncompleteDate(value)) return value;
            return new Date(value.replace(/-/g, '/')); // fix for prevent Data constructor use UTC time zone when accept date string with '-' separator
            // return isDate(value)
            //     ? value instanceof Date
            //         ? value
            //         : new Date(value.replace(/-/g, '/')) // fix for prevent Data constructor use UTC time zone when accept date string with '-' separator
            //     : null;
        }
        case 'text':
        case 'string':
            return isString(value) ? value : joinWithSeparator(flatten(value));
        case 'list':
            return isArray(value) ? value : isObject(value) ? flatten(value) : null;
        case 'object':
            return isObject(value) ? value : null;
        case 'number':
            return isNumber(value)
                ? parseFloat(value)
                : isDate(value)
                ? castAs(value, 'date').getTime()
                : 0;
        case 'range':
            return value instanceof Range
                ? value
                : isArray(value)
                ? new Range(flags, value)
                : isObject(value)
                ? new Range(flags, [value.start, value.end])
                : new Range(flags, [value]);
        case 'tag':
            return value instanceof Code
                ? value
                : isArray(value)
                ? new Code(flags, [value])
                : value instanceof BaseEntity
                ? new Code(flags, [[null, value, null]])
                : isObject(value)
                ? new Code(flags, [value])
                : new Code(flags, [[null, value, null]]);
    }

    return value;
}

/**
 * Analyzes the value to determine of it's a date, a number, or a any (default)
 * @param {*} value
 * @returns {string} The inferred type.
 */
function inferType(value, flags = {}) {
    if (value instanceof BaseEntity) {
        return 'entity';
    } else if (value instanceof Date) {
        return 'date';
    }

    const type = typeof value;

    // for (const prop in flags) {
    //     if (['number', 'date', 'list', 'map', 'json'].includes(prop)) {
    //         return prop;
    //     }
    // }

    if (type == 'undefined' || value === null) {
        return 'null';
    } else if (type == 'boolean') {
        return type;
    } else if (isArray(value)) {
        return 'list';
    } else if (isNumber(value)) {
        return 'number';
    } else if (isDate(value)) {
        return 'date';
    } else if (isObject(value)) {
        return 'object';
    }

    return type;
}

/**
 * MARK: Formatters
 * @namespace Formatters
 * @description Functions that format values.
 */

// function valueRange(start, end, type, format) {
//     start = start ? formatValue(start, type, format) : getPresentValue();
//     end = end ? formatValue(end, type, format) : getPresentValue();

//     return `${start} – ${end}`;
// }

/**
 * Format and localize a date string.
 *
 * @param {Object} flags - Format flags.
 * @param {Date} value - The date to format.
 * @returns {string} The formatted date.
 */
function formatDate(flags, date) {
    if (!isDate(date)) {
        return null;
    }

    // In addition to 'medium', 'full', 'long', 'short'
    const formats = {
        medium: 'medium',
        full: 'full',
        long: 'long',
        short: 'short',
        y: { year: 'numeric' },
        m: { month: 'long' },
        mm: { month: '2-digit' },
        ym: { year: 'numeric', month: 'long' },
        ymm: { year: 'numeric', month: '2-digit' },
    };

    let options = flags.date;

    if (isString(options)) {
        options = formats[options];
    }

    if (!options || options === true) {
        options = 'medium';
    }

    if (isString(options)) {
        options = { dateStyle: options };
    }

    if (date instanceof Date) {
        return date.toLocaleDateString(flags.locale, options);
    } else {
        // it is possible that the date is a string when it is incomplete and date mode is auto
        return date;
    }
}

/**
 * Format and localize a number.
 * @param {Object} flags - Format flags.
 * @param {string|number} value - The number or number string to format.
 * @returns {string} The formatted number.
 */
function formatNumber(flags, value) {
    return isNaN(value) ? '' : value.toLocaleString(flags.locale, flags.style);
}

/**
 * Formats the input text.
 * @param {Object} flags - Format flags.
 * @param {string|number} text - The number string to format.
 * @returns {string} The formatted value.
 */
function formatText(flags, text) {
    if (typeof text != 'string') {
        console.error(`Expecting a string. Found:`, text);
        return '';
    }

    text = text.trim() || '';

    // const number = parseFloat(numberString);
    // return number.toLocaleString(locale, format);
    switch (flags.style) {
        case 'list':
            return text.split('|').join(' ');
        case 'rlist':
            return text.split('|').reverse().join(' ');
        // case 'lang':
        //     return pickLang(text, locale);
        case 'array':
            return text.split('|');
        default:
            return text;
    }
}

function formatList(flags, list) {
    const result = [];

    for (let item of list) {
        if (isArray(item)) {
            item = formatList(flags, item);
        } else if (isObject(item)) {
            item = formatObject(flags, item);
        }

        if (item) result.push(item);
    }

    return result.join(flags.sep === undefined ? ' ' : flags.sep);
}

function formatObject(flags, obj) {
    // return Object.entries(obj).reduce((str, [key, value], index, array) => {
    //     str += `${key}: ${value}`;
    //     if (index < array.length - 1) str += ', ';
    //     return str;
    // }, '');
    return JSON.stringify(obj);
}

/**
 * Capitalizes the text based on locale-specific rules. For English locales, it applies title case rules,
 * capitalizing the first letter of each major word and leaving smaller, less significant words in lowercase,
 * except when they start or end the title. For all non-English locales, it capitalizes only the first letter
 * of the entire text, assuming no specific capitalization rules for titles in those languages.
 *
 * @param {string} text - The text to be capitalized.
 * @param {string} [locale=''] - A custom locale based on which the text capitalization is adjusted.
 * @returns {string} The capitalized text suitable for titles and headings according to the specified locale.
 */
function capitalizeText(text, locale) {
    locale = getLocale(locale);

    // List of English small words that are generally not capitalized in titles, unless they are the first or last word.
    const smallWords = new Set([
        'and',
        'or',
        'but',
        'a',
        'an',
        'the',
        'in',
        'on',
        'at',
        'to',
        'for',
        'with',
        'not',
    ]);

    /**
     * Helper function to capitalize the first letter of a word and make the rest lowercase.
     * @param {string} word - The word to capitalize.
     * @returns {string} The capitalized word.
     */
    function capitalize(word) {
        return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1).toLocaleLowerCase(locale);
    }

    // Check if the locale starts with 'en' to determine if it's an English locale.
    if (locale.toLowerCase().startsWith('en')) {
        // Handle English with specific title casing rules, mapping over each word in the sentence.
        return text
            .split(' ')
            .map((word, index, array) => {
                if (
                    index === 0 ||
                    index === array.length - 1 ||
                    !smallWords.has(word.toLowerCase())
                ) {
                    // Capitalize the first and last word of the title and any significant word not in the smallWords set.
                    return capitalize(word);
                }
                // Small connector words in the middle of a title are kept in lowercase.
                return word.toLowerCase();
            })
            .join(' ');
    } else {
        // For non-English locales, simply capitalize the first letter of the entire text.
        return capitalize(text);
    }
}

/**
 * MARK: Localization
 * @namespace Localization
 * @description Functions designed to localize values.
 */

function setLocale(locale) {
    CURRENT_LOCALE = locale || (typeof document !== 'undefined' && document.documentElement?.getAttribute('lang')) || 'en';
}

function getLocale(locale = null) {
    // Make sure that set local is initialized
    if (!CURRENT_LOCALE) setLocale();

    return locale || CURRENT_LOCALE;
}

function getLanguageCode(locale = null) {
    return getLocale(locale).split('-')[0].toLowerCase();
}

function getPresentValue(locale) {
    return {
        en: 'Present',
        fr: 'présent',
        es: 'presente',
        de: 'heute',
        it: 'presente',
        pt: 'presente',
        zh: '至今',
        ja: '現在',
        ko: '현재',
        ru: 'настоящее время',
        ar: 'الحاضر',
        hi: 'वर्तमान',
        bn: 'বর্তমান',
        id: 'sekarang',
        nl: 'heden',
        pl: 'obecnie',
        ro: 'prezent',
        sv: 'nuvarande',
        tr: 'günümüz',
        uk: 'теперішній час',
        vi: 'hiện tại',
    }[getLanguageCode(locale)];
}

function buildAux(flags, value) {
    return value ? new Code(flags, [['u-aux', value]]).format() : '';
}

function buildValueGroup(flags, value) {
    if (!value && !flags.force) return '';

    let level = flags.level || 3;
    return new Code(flags, [
        [
            'u-value-group',
            new Code(flags, [
                [`h${level}`, flags.heading],
                ['span', value],
            ]),
        ],
    ]).format();
}

function buildInlineValueGroup(flags, value) {
    if (!value && !flags.force) return '';

    return new Code(flags, [
        [
            'u-inline-value-group',
            new Code(flags, [
                ['label', flags.label],
                ['span', value],
            ]),
        ],
    ]).format();
}

class BaseEntity {
    constructor(flags, values) {
        this.flags = { ...flags };

        this.values = Array.isArray(values)
            ? [...values]
            : typeof values === 'object'
            ? { ...values }
            : values;

        this.parsedArgs = null;

        if (new.target === BaseEntity) {
            throw new TypeError('Cannot instantiate BaseEntity directly.');
        }
    }

    format() {
        return this.values;
    }

    isEmpty() {
        throw new Error("Method 'isEmpty()' must be implemented.");
    }

    toString() {
        throw new Error("Method 'toString()' must be implemented.");
    }

    getParsedArgs(values) {
        if (this.parsedArgs) return this.parsedArgs;

        let args = {};
        const filedMapping = this.getFieldMapping();

        const givenArgs = Object.keys(values);

        Object.keys(filedMapping).forEach((target) => {
            let source = filedMapping[target];

            if (!Array.isArray(source)) {
                source = [source];
            }

            let conditions = [],
                cases = [];

            source.forEach((item) => {
                if (Array.isArray(item)) {
                    let val = this.applyFunction(values, item);

                    conditions.push(val);
                    cases.push(val);
                } else {
                    conditions.push(givenArgs.includes(item));
                    cases.push(values?.[item] || '');
                }
            });

            let tgtVal = switchCase({}, conditions, cases);

            args[target] = tgtVal;
        });

        return args;
    }

    applyFunction(item, parts) {
        const func = parts.shift(); // Get the first element as function

        switch (func) {
            case '.':
                const source = parts[1];

                if (!item?.[source]) return false;

                let data = item[source];

                const key = parts[0];

                return key || key === 0 ? data[key] : '';
            default:
                return false;
        }
    }

    getFieldMapping() {
        return {};
    }
}

/**
 * MARK: Classes
 * @namespace Classes
 * @description Classes representing types.
 */

class Localizable extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        let val = isArray(values) ? values?.[0] : values;
        this.values = isObject(val) ? val : {};
    }

    toString() {
        return this.values[this.flags.lang];
    }

    isEmpty() {
        return !this.values || Object.keys(this.values).length === 0;
    }
}

class Range extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        const flatValues = flatten(values);

        const start = flatValues[0];
        const end = flatValues[1];

        this.givenStart = start;
        this.givenEnd = end;

        // The default is a closed Range (open=false)
        this.includeStart = !flags.open;
        this.includeEnd = !flags.open;

        if (!this.flags.type) {
            this.flags.type = start ? inferType(start) : inferType(end);
            // if (this.flags.type === 'range') this.flags.type = 'number';
        }

        this.start = castAs(start, 'number');
        this.end = castAs(end, 'number');
    }

    /**
     * Check if the Range includes a specific value
     */
    contains(value) {
        if (value instanceof Range) return this.overlaps(value);

        value = castAs(value, 'number');

        let inStart = this.start
            ? this.includeStart
                ? value >= this.start
                : value > this.start
            : true;
        let inEnd = this.end ? (this.includeEnd ? value <= this.end : value < this.end) : true;

        return inStart && inEnd;
    }

    /**
     * Check if another Range overlaps with this Range.
     */
    overlaps(otherRange) {
        // Case 1: Both ranges fully defined
        // 1a: otherRange is entirely contained within this range
        // 1b: otherRange overlaps with this range
        // 1c: this range is entirely contained within otherRange
        if (this.start && this.end && otherRange.start && otherRange.end) {
            const otherEntirelyWithinThis =
                (this.includeStart || otherRange.includeStart
                    ? otherRange.start >= this.start
                    : otherRange.start > this.start) &&
                (this.includeEnd || otherRange.includeEnd
                    ? otherRange.end <= this.end
                    : otherRange.end < this.end);

            const thisEntirelyWithinOther =
                (this.includeStart || otherRange.includeStart
                    ? this.start >= otherRange.start
                    : this.start > otherRange.start) &&
                (this.includeEnd || otherRange.includeEnd
                    ? this.end <= otherRange.end
                    : this.end < otherRange.end);

            const hasOverlap =
                (this.includeStart || otherRange.includeStart
                    ? otherRange.start <= this.end
                    : otherRange.start < this.end) &&
                (this.includeEnd || otherRange.includeEnd
                    ? otherRange.end >= this.start
                    : otherRange.end > this.start);

            return otherEntirelyWithinThis || thisEntirelyWithinOther || hasOverlap;
        }

        // Case 2: `this` has only a start (open-ended on the right)
        // This condition checks if otherRange starts at or after this.start
        if (this.start && !this.end) {
            return otherRange.start
                ? this.includeStart || otherRange.includeStart
                    ? otherRange.start >= this.start
                    : otherRange.start > this.start
                : true;
        }

        // Case 3: `this` has only an end (open-ended on the left)
        // This condition checks if otherRange ends at or before this.end
        if (!this.start && this.end) {
            return otherRange.end
                ? this.includeEnd || otherRange.includeEnd
                    ? otherRange.end <= this.end
                    : otherRange.end < this.end
                : true;
        }

        // Case 4: `otherRange` has only a start (open-ended on the right)
        // This condition checks whether otherRange.start falls within this range, assuming this has both start and end defined.
        if (otherRange.start && !otherRange.end) {
            return this.start && this.end
                ? (this.includeStart || otherRange.includeStart
                      ? otherRange.start >= this.start
                      : otherRange.start > this.start) &&
                      (this.includeEnd ? otherRange.start <= this.end : otherRange.start < this.end)
                : true;
        }

        // Case 5: `otherRange` has only an end (open-ended on the left)
        // This condition checks whether otherRange.end falls within this range, assuming this has both start and end defined.
        if (!otherRange.start && otherRange.end) {
            return this.start && this.end
                ? (this.includeStart
                      ? otherRange.end >= this.start
                      : otherRange.end > this.start) &&
                      (this.includeEnd || otherRange.includeEnd
                          ? otherRange.end <= this.end
                          : otherRange.end < this.end)
                : true;
        }

        // Case 6: `this` has only an end, and `otherRange` has only a start
        // This condition checks if the start of otherRange is before or at the end of this range. Overlap occurs if the two unbounded ranges touch or intersect.
        if (!this.start && this.end && otherRange.start && !otherRange.end) {
            return this.includeEnd ? otherRange.start <= this.end : otherRange.start < this.end;
        }

        // Case 7: `this` has only a start, and `otherRange` has only an end
        // This condition checks if the end of otherRange is after or at the start of this range. Overlap occurs if the two unbounded ranges touch or intersect.
        if (this.start && !this.end && !otherRange.start && otherRange.end) {
            return this.includeStart ? otherRange.end >= this.start : otherRange.end > this.start;
        }

        // Case 8: `this` is fully open (infinite line)
        if (!this.start && !this.end) {
            return true;
        }

        // Case 9: `otherRange` is fully open (infinite line)
        if (!otherRange.start && !otherRange.end) {
            return true;
        }

        // Case 10: Both ranges fully undefined
        if (!this.start && !this.end && !otherRange.start && !otherRange.end) {
            return true;
        }

        return false;
    }

    format(flags) {
        //Temp solution for not wrapping internal dates
        flags = { ...flags, ...this.flags };

        const sep = flags.separator || ' – ';

        let start = this.givenStart;
        let end = this.givenEnd;

        if (flags.type === 'date') {
            start = start ? formatValue(flags, start) : getPresentValue(flags.locale);
            end = end ? formatValue(flags, end) : getPresentValue(flags.locale);
        } else if (flags.type !== 'range') {
            // start = start ? formatValue(flags, start) : '';
            // end = end ? formatValue(flags, end) : '';
            start = formatValue(flags, start || '');
            end = formatValue(flags, end || '');
        }

        return start || end ? `${start}${sep}${end}` : '';
    }

    isEmpty() {
        return !this.values || (Array.isArray(this.values) && !this.values.filter(Boolean).length);
    }

    /**
     *  Method to convert Range to string
     */
    toString() {
        return this.format();
    }
}

/**
 * E.g. {<> [‘u-tab’ @country_of_citizenship] (‘, ‘ country_of_citizenship/country_of_citizenship)}
 */
class Code extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        let { tag: tags } = flags;

        let flagTags = tags ? (!isArray(tags) ? [tags] : tags) : [];

        this.markups = values.map((item) => {
            let tag = '';
            let children = '';
            let attrs = {};
            if (Array.isArray(item)) {
                [tag, children, attrs = {}] = item;
            } else if (typeof item === 'object') {
                tag = item.tag || '';
                children = item.children || '';
                attrs = item.attrs || {};
            } else if (typeof item === 'string') {
                children = item;
                // return { tag: 'span', children: item, attrs: {} };
            }

            let mergedTags = tag ? [...flagTags, tag] : [...flagTags];

            if (!mergedTags.length) mergedTags = ['span'];

            return { tag: mergedTags, children, attrs };
        });
    }

    format() {
        let result = '';

        const formatTags = ['strong', 'em', 'u', 's', 'sup', 'sub'];

        this.markups.forEach((m) => {
            const { tag: tags, children, attrs } = m;

            let itemResult = children || '';

            tags.forEach((t, i) => {
                let tagName = '';

                let itemAttrs = {};

                switch (t) {
                    case 'bold':
                        tagName = 'strong';
                        break;
                    case 'italic':
                        tagName = 'em';
                        break;
                    case 'underline':
                        tagName = 'u';
                        break;
                    case 'strikethrough':
                        tagName = 's';
                        break;
                    case 'superscript':
                        tagName = 'sup';
                        break;
                    case 'subscript':
                        tagName = 'sub';
                        break;
                    default:
                        tagName = t;
                }

                if (formatTags.includes(tagName)) {
                    if (!itemResult) return '';
                    else if (itemResult instanceof BaseEntity && itemResult.isEmpty()) return '';
                }

                //Use code with other flags;
                if (i === 0) {
                    //apply attrs to the outermost tag
                    itemAttrs = attrs;
                }

                if (itemAttrs && Object.keys(itemAttrs).length) {
                    tagName = tagName === '_self' ? 'span' : tagName;
                    let attrs = Object.keys(itemAttrs).reduce((acc, key) => {
                        return `${acc} ${key}="${itemAttrs[key]}"`;
                    }, '');

                    itemResult = `<${tagName}${attrs}>${itemResult}</${tagName}>`;
                } else {
                    if (!(tagName === 'span' && !itemResult))
                        itemResult =
                            tagName === '_self'
                                ? itemResult
                                : `<${tagName}>${itemResult}</${tagName}>`;
                }
            });

            result += itemResult;
        });

        return result;
    }

    isEmpty() {
        return (
            this.markups.length === 1 &&
            this.markups[0].tag.length === 1 &&
            !this.markups[0].children &&
            (!this.markups[0].attrs || !Object.keys(this.markups[0].attrs).length)
        );
    }

    toString() {
        return this.format();
    }
}

/**
 * Example: {phone -mode=’simple’ {type: phone_type country: country_code area:area_code number: telephone_number ext:extension start: telephone_start_date end:telephone_end_date}}
 */
class PhoneNumber extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        this.parsedArgs = this.getParsedArgs(values?.[0] || {});
    }

    getFieldMapping() {
        return {
            type: ['type', 'phone_type', 'telephone_type'],
            country: ['country', 'country_code', 'telephone_country', 'phone_country'],
            area: ['area', 'area_code', 'telephone_area', 'phone_area'],
            number: ['number', 'telephone_number', 'phone_number'],
            ext: ['ext', 'extension', 'telephone_extension', 'phone_extension'],
            start: ['start', 'telephone_start_date', 'phone_start_date'],
            end: [
                'end',
                'telephone_end_date',
                'phone_end_date',
                'telephone_expiration_date',
                'phone_expiration_date',
            ],
        };
    }

    format() {
        if (this.isEmpty()) return '';

        const { link = false } = this.flags;

        const { type, country, ext, start, end } = this.parsedArgs;

        // if(this.flags.mode === 'simple') {

        // }

        let expiration = new Range({}, [start, end]).format();

        let parts = [
            joinIfAllTrue([type, ':']),
            joinIfAllTrue(['+', country]),
            this.buildNumber(),
            joinIfAllTrue(['x ', ext]),
            // joinIfAllTrue(['(', new Range({}, [start, end]), ')']),
            expiration ? new Code({}, [['u-aux', expiration]]).format() : '',
        ];

        return parts.filter(Boolean).join(' ');
    }

    buildNumber() {
        const { area, number } = this.parsedArgs;

        if (!area && !number) return '';

        return joinIfAllTrue([joinIfAllTrue(['(', area, ') ']), number]);
    }

    isEmpty() {
        return !this.buildNumber();
    }

    toString() {
        return this.format();
    }
}

class Address extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        this.parsedArgs = this.getParsedArgs(values?.[0]);
    }

    getFieldMapping() {
        return {
            type: ['type', 'address_type'],
            line1: ['line1', 'line_1', 'address_-_line_1', 'address_line_1'],
            line2: ['line2', 'line_2', 'address_-_line_2', 'address_line_2'],
            line3: ['line3', 'line_3', 'address_-_line_3', 'address_line_3'],
            line4: ['line4', 'line_4', 'address_-_line_4', 'address_line_4'],
            line5: ['line5', 'line_5', 'address_-_line_5', 'address_line_5'],
            start: ['start', 'address_start_date', 'start_date'],
            end: [
                'end',
                'address_end_date',
                'end_date',
                'expiration_date',
                'address_expiration_date',
            ],
            city: ['city', 'address_city'],
            province: [
                ['.', 0, 'location'],
                'province',
                'address_province',
                'state',
                'address_state',
            ],
            country: [['.', 1, 'location'], 'country', 'address_country'],
            zip: ['zip', 'postal_code', 'address_zip', 'address_postal_code', 'postal_zip_code'],
        };
    }

    format() {
        if (this.isEmpty()) return '';

        const {
            type,
            country,
            city,
            line1 = '',
            line2 = '',
            line3 = '',
            line4 = '',
            line5 = '',
            province,
            zip = '',
            start = '',
            end = '',
        } = this.parsedArgs;

        let lines = [
            joinWithSeparator({}, [
                ' ',
                formatValue({ tag: 'bold', type: 'tag', bold: true }, joinIfAllTrue([type, ':'])),
                joinWithSeparator({}, [
                    ' ',
                    line1,
                    joinIfAllTrue(['(', new Range({}, [start, end]), ')']),
                ]),
            ]),
            line2,
            line3,
            line4,
            line5,
            joinWithSeparator({}, [
                ', ',
                city,
                joinWithSeparator({}, [' ', province, joinIfAllTrue(['(', country, ')'])]),
            ]),
            zip,
        ];

        return lines.filter(Boolean).join('</br>');
    }

    isEmpty() {
        const { country, city, line1 = '', province } = this.parsedArgs;

        return !country && !city && !line1 && !province;
    }

    toString() {
        return this.format();
    }
}

class Organization extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        this.parsedArgs = this.getParsedArgs(values?.[0]);
    }

    get name() {
        return this.parsedArgs.organization;
    }

    get country() {
        return this.parsedArgs.country;
    }

    get province() {
        return this.parsedArgs.province;
    }

    get type() {
        return this.parsedArgs.type;
    }

    getFieldMapping() {
        return {
            organization: [
                ['.', 0, 'organization'],
                'organization',
                'other_organization',
                'other_organization_type',
            ],
            country: [['.', 1, 'organization']],
            province: [
                ['.', 2, 'organization'],
                'province',
                'organization_province',
                'state',
                'organization_state',
            ],
            type: [['.', 3, 'organization'], 'type', 'organization_type'],
        };
    }

    format() {
        if (this.isEmpty()) return '';

        const { type, organization, country, province } = this.parsedArgs;

        // return joinWithSeparator({}, [
        //     ' ',
        //     organization,
        //     joinIfAllTrue(['(', joinWithSeparator({}, ['-', country, province, type]), ')']),
        // ]);

        const aux = joinWithSeparator(null, [' - ', country, province, type]);

        return new Code({}, [
            [
                'u-org',
                new Code({}, [
                    ['u-org-name', organization],
                    ['_self', buildAux({}, aux)],
                ]),
            ],
        ]).format();
    }

    isEmpty() {
        const { organization } = this.parsedArgs;

        return !organization;
    }

    toString() {
        return this.format();
    }
}

class RefEntity extends BaseEntity {
    constructor(flags, values) {
        super(flags, flatten(values));
    }

    format() {
        const [name, ...extra] = this.values;

        const aux = joinWithSeparator(null, [' - ', ...extra]);

        return name
            ? new Code({}, [
                  [
                      'u-ref',
                      new Code({}, [
                          ['u-ref-name', name],
                          ['_self', buildAux({}, aux)],
                      ]),
                  ],
              ]).format()
            : '';
    }

    isEmpty() {
        return !this.values || !this.values.length;
    }

    toString() {
        return this.format();
    }
}

class Currency extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        this.parsedArgs = this.getParsedArgs(values?.[0]);
    }

    getFieldMapping() {
        return {
            amount: ['amount', 'currency_amount'],
            currency: ['currency', 'currency_code'],
            convertedAmount: ['converted_amount', 'converted_currency_amount'],
        };
    }

    format() {
        if (this.isEmpty()) return '';

        const { amount, currency, convertedAmount } = this.parsedArgs;

        const currencyCode = currency_code[currency.toLowerCase()];

        let amountVal = currencyCode
            ? new Intl.NumberFormat(`${getLocale()}-CA`, {
                  style: 'currency',
                  currency: currencyCode,
              }).format(amount)
            : amount;

        const children = [['u-amount', amountVal]];

        if (currency) {
            children.push(['u-unit', currency]);
        }

        if (convertedAmount && convertedAmount !== '0') {
            children.push([
                'u-aux',
                new Intl.NumberFormat(`${getLocale()}-CA`, {
                    style: 'currency',
                    currency: 'CAD',
                }).format(convertedAmount),
            ]);
        }

        return new Code({}, [['u-currency', new Code({}, children)]]).format();
    }

    isEmpty() {
        return !this.parsedArgs.amount;
    }

    toString() {
        return this.format();
    }
}

class Email extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        this.parsedArgs = this.getParsedArgs(values?.[0] || {});
    }

    getFieldMapping() {
        return {
            type: ['type', 'email_type'],
            email: ['address', 'email_address'],
            start: ['start', 'email_start_date', 'start_date'],
            end: ['end', 'email_end_date', 'end_date'],
        };
    }

    format() {
        if (this.isEmpty()) return '';

        const { type, email, start = '', end = '' } = this.parsedArgs;

        let expiration = new Range({}, [start, end]).format();

        let parts = [
            joinIfAllTrue([type, ':']),
            email,
            expiration ? new Code({}, [['u-aux', expiration]]).format() : '',
        ];

        return parts.filter(Boolean).join(' ');
    }

    isEmpty() {
        const { type, email } = this.parsedArgs;

        return !type || !email;
    }

    toString() {
        return this.format();
    }
}

class DateTime extends BaseEntity {
    constructor(flags, values) {
        super(flags, values);

        let date = values[0];

        if (!(date instanceof Date)) {
            date = isDate(date) ? new Date(value) : null;
        }

        this.parsedArgs = { date };
    }

    format() {
        if (this.isEmpty()) return '';

        // this.flags.type
        // consider types, like: elapsed-time, datetime, yearmonth, ...
    }

    isEmpty() {
        return !this.parsedArgs.date;
    }

    toString() {
        return this.format();
    }

    valueOf() {
        return this.isEmpty() ? 0 : this.parsedArgs.date.getTime();
    }
}
