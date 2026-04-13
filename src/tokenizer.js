export { findEnclosures, parseKeyValues, parseSnippets, parseCommands };

const SPACES_REGEX = /\s+/;
const OPERATOR_REGEX = /([+\-*\/=<>!&|]+)/;
const PRECEDENCE = {
    '|': 1,
    '&': 2,
    '=': 3,
    '!=': 3,
    '<': 4,
    '<=': 4,
    '>': 4,
    '>=': 4,
    '+': 5,
    '-': 5,
    '*': 6,
    '/': 6,
    '%': 6,
    '!': 7,
};

/**
 * Tokenize the text into 3 types of tokens: text, quote, or enclosure.
 *
 * @param {string} text - The text to tokenize.
 * @param {Object} delimiters - The start and end characters: eg, {'[': ']', '(': ')'};
 * @param {Object} [options={}] - Custom parsing options.
 * @param {numeric} [options.minQuoteLevel=0] - Level of nested enclosure at which strings are considered.
 * @param {numeric} [options.splitText=false] - Whether to split text tokens by spaces (and filter empties)
 * @param {numeric} [options.skipCommas=false] - Whether to ignore commas when splitting text.
 * @returns {Array} An array of tokens of the form {type, value}.
 */
function findEnclosures(text, delimiters, options = {}) {
    const startChars = Object.keys(delimiters);
    const minQuoteLevel = options.minQuoteLevel || 0;
    const splitText = options.splitText || false;
    const skipCommas = options.skipCommas || true;
    const elements = [];
    let index = 0;
    let currentElement = '';
    let insideQuotes = false;
    let quoteChar = '';
    let enclosureStack = [];
    let expectedEndChar = '';
    let stackLength = 0;

    // ASCII 39: Single Quotation Mark
    // ASCII 34: Single Double Mark
    // ASCII 96: Single Backtick Mark
    // U+2018: Left Single Quotation Mark
    // U+2019: Right Single Quotation Mark
    // U+201C: Left Double Quotation Mark
    // U+201D: Right Double Quotation Mark
    const quoteTypes = ["'", '"', '`', '‘', '’', '“', '”'];

    const isClosingQuote = (firstChar, char) => {
        if (firstChar === char) return true;

        return (
            (['‘', '’'].includes(firstChar) && ['‘', '’'].includes(char)) ||
            (['“', '”'].includes(firstChar) && ['“', '”'].includes(char))
        );

        // return firstChar === '‘' ? char === '’' : firstChar === '“' ? char === '”' : false;
    };

    function addElement(type, value) {
        if (splitText && type == 'text') {
            const words = value.trim().split(SPACES_REGEX);
            for (let word of words) {
                if (skipCommas) word = removeCommas(word);

                if (word !== '') {
                    elements.push({ type, value: word });
                }
            }
        } else {
            elements.push({ type, value });
        }
        currentElement = '';
    }

    function addNonText(newChar) {
        if (stackLength === 0) {
            if (currentElement !== '') {
                addElement('text', currentElement);
            }
            currentElement = newChar;
        } else {
            currentElement += newChar;
        }
    }

    while (index < text.length) {
        const char = text[index];

        if (startChars.includes(char) && !insideQuotes) {
            addNonText(char); // start a new enclosure
            stackLength = enclosureStack.push(char);
            expectedEndChar = delimiters[char];
        } else if (char === expectedEndChar && !insideQuotes) {
            currentElement += char;
            enclosureStack.pop(); // finish the current enclosure
            stackLength--;
            expectedEndChar = stackLength > 0 ? delimiters[enclosureStack[stackLength - 1]] : '';
            if (stackLength === 0) {
                addElement('enclosure', currentElement);
            }
        } else if (!insideQuotes && quoteTypes.includes(char) && stackLength > minQuoteLevel) {
            addNonText(char);
            insideQuotes = true; // start a new quote
            quoteChar = char;
        } else if (insideQuotes && isClosingQuote(quoteChar, char)) {
            currentElement += char;
            insideQuotes = false; // finish the current quote
            if (stackLength === 0) {
                addElement('quote', currentElement);
            }
        } else {
            currentElement += char;
        }

        index++;
    }

    if (currentElement !== '') {
        addElement('text', currentElement);
    }

    return elements;
}

/**
 * Parse a string with a list of key-value pairs.
 *
 * @example 'currency: USD, style: currency'
 * @param {Array} tokens - A list of key-value pairs.
 * @returns {object} The resulting object.
 *
 * @example
 * 'style-long test:1 list:[1, "2-B", 3]' evaluates to
 * {style-long: true, test: 1, list: [1, "2-B", 3]}
 */
function parseKeyValues(tokens) {
    let index = 0;
    let currentElement = '';
    let lastKey = '';
    let hasKey = false;
    const map = new Map();

    function addValue(type, value) {
        map.set(lastKey, { type, value });
        hasKey = false;
        currentElement = '';
    }

    function addKey(key) {
        map.set(key, { type: 'text', value: true });
        hasKey = true;
        lastKey = key;
        currentElement = '';
    }

    while (index < tokens.length) {
        const token = tokens[index];

        // console.log('step:', hasKey ? 'y' : 'n', lastKey, currentElement, token.type, token.value);

        if (token.type == 'text' && token.value !== ':') {
            const parts = token.value.split(':');
            // console.log('parts', parts);
            if (parts.length === 1) {
                currentElement += token.value;
            } else if (hasKey) {
                currentElement += parts[0];
                addValue('text', currentElement);
                currentElement = parts[1] ?? '';
            } else {
                currentElement += parts[0];
                lastKey = currentElement;
                addKey(lastKey);
                currentElement = parts[1] ?? '';
            }
        } else {
            if (currentElement !== '') {
                hasKey ? addValue('text', currentElement) : addKey(currentElement);
            }

            if (hasKey && token.value !== ':') {
                addValue(token.type, token.value);
            } else if (token.type == 'quote') {
                lastKey = token;
                addKey(lastKey);
            } else if (token.value !== ':') {
                console.warn(`Unexpected key: ${token.value} type: ${token.type}`);
            }
        }

        if (currentElement !== '') {
            hasKey ? addValue('text', currentElement) : addKey(currentElement);
        }

        index++;
    }
    // console.log(map);
    return map;
}

/**
 * Parses a string containing tagged snippets and extracts them into an object.
 *
 * Snippet definition: [name arg1 ...args] { ...body... }
 *
 * The body part can be the code that can be place in a regular placeholder, or
 * a mix of plain text with placeholders.
 *
 * @example
 * [tag1 age] { I'm {age}yo } [tag2 arg1 ...args] { . 1 args }
 *
 * @param {string} str - The input string to parse.
 * @returns {Object} An object containing the extracted snippets and any parsing errors.
 *   - snippets: An object where the keys are snippet names and the values are objects
 *     containing the snippet arguments and body.
 *   - errors: An array of error messages for invalid snippet patterns or argument names.
 */
function parseSnippets(input, errors = []) {
    if (typeof input !== 'string') {
        return input instanceof Object ? { ...input } : {};
    }

    const parts = findEnclosures(input, { '{': '}', '(': ')' }, { minQuoteLevel: 1 });
    const snippets = {};

    function onError(type, expected, head) {
        const msg = `Invalid ${type} for snippet: ${head}. Expecting: ${expected}`;
        errors.push(msg);
        console.error(msg);
    }

    if (parts.length <= 1) {
        onError('input', '[name arg ...] { ... }', input);
    }

    // Analyze in pairs
    for (let i = 1; i < parts.length; i += 2) {
        const head = parts[i - 1].value.trim();
        const bodyType = parts[i].type === 'enclosure' ? parts[i].value[0] : '';
        const body = bodyType == '{' || bodyType == '(' ? parts[i].value.slice(1, -1).trim() : '';

        // Check that the head is [...]
        if (head.length < 3 || !head.startsWith('[') || !head.endsWith(']')) {
            onError('header', '[ ... ]', head);
        } else if (!body) {
            onError('empty body', '{ ... }', head);
        } else {
            // Remove the [ and ] from the head and split the args in it
            const args = head.slice(1, -1).trim().split(SPACES_REGEX);
            const name = args.shift(); // returns undefined in array is empty
            const hasFlags = args[0] === '$0';

            if (hasFlags) args.shift();

            if (!name || !/^[a-zA-Z_]\w*$/.test(name)) {
                // The function name must start with a letter
                onError('name', 'word', args.join(' '));
            } else if (!args.every((arg) => /^(\.\.\.)?[a-zA-Z_]\w*$/.test(arg))) {
                // Arguments have to start with a letter (...arg is allowed too)
                onError('arguments', 'words', args.join(' '));
            } else {
                // See if there are placeholders in the body
                // const mixed = !!findEnclosures(body, { '{': '}' }).find(
                //     (item) => item.type === 'enclosure'
                // );
                // const mixed = bodyType == '{';

                snippets[name] = { args, body, isText: bodyType == '{', hasFlags };
            }
        }
    }

    return snippets;
}

function removeCommas(str) {
    let start = 0;
    let end = str.length - 1;

    // Move the start index towards the first non-comma character
    while (start <= end && str[start] === ',') {
        start++;
    }

    // Move the end index back towards the last non-comma character
    while (end >= start && str[end] === ',') {
        end--;
    }

    // Slice the string from the start index to end index + 1
    return str.slice(start, end + 1);
}

/**
 * Makes sure that text-type tokens with operators in them and broken
 * up into sub-tokens where each operator is an individual token.
 * @param {*} tokens
 * @returns
 */
function normalizeTokens(tokens) {
    const normalizedTokens = [];
    let splitTokens, value, isOperator;

    for (let token of tokens) {
        if (token.type === 'text') {
            splitTokens = token.value.split(OPERATOR_REGEX);

            if (splitTokens.length <= 1) {
                normalizedTokens.push(token);
            } else {
                for (let i = 0; i < splitTokens.length; i++) {
                    value = splitTokens[i].trim();

                    if (value !== '') {
                        isOperator = '+-*/=<>!&|'.includes(value[0]);
                        if (value === '!') {
                            normalizedTokens.push({ type: 'text', value: '' });
                        }
                        normalizedTokens.push({ type: 'text', value, isOperator });
                    }
                }
            }
        } else {
            normalizedTokens.push(token);
        }
    }

    return normalizedTokens;
}

function identifyOperatorChains(tokens) {
    const chainTokens = [];
    let i = 0;
    let inChain = false;
    let currentChain = [];

    // Note: a starting operator (with no left-hand-side argument), is
    // not considered a valid start of a chain
    while (i < tokens.length) {
        const token = tokens[i];
        const nextToken = tokens[i + 1];

        if (nextToken && nextToken.isOperator) {
            if (!inChain) {
                inChain = true;
                currentChain = [];
            }
            currentChain.push(token, nextToken);
            i += 2;
        } else {
            if (inChain) {
                inChain = false;
                currentChain.push(token);
                chainTokens.push({ type: 'chain', tokens: currentChain });
            } else {
                chainTokens.push(token);
            }
            i++;
        }
    }

    if (inChain) {
        chainTokens.push({ type: 'chain', tokens: currentChain });
    }

    return chainTokens;
}

/**
 * Standard "Shunting Yard" algorithm to convert chain to Polish order.
 * @param {*} tokens
 * @returns
 */
function shuntingYard(tokens) {
    const outputQueue = [];
    const operatorStack = [];
    let operator, right, left;

    for (let token of tokens) {
        if (!token.isOperator) {
            outputQueue.push(token.value);
        } else {
            while (
                operatorStack.length > 0 &&
                PRECEDENCE[operatorStack[operatorStack.length - 1]] >= PRECEDENCE[token.value]
            ) {
                operator = operatorStack.pop();
                right = outputQueue.pop();
                left = outputQueue.pop();
                outputQueue.push(`(${operator} ${left} ${right})`);
            }
            operatorStack.push(token.value);
        }
    }

    while (operatorStack.length > 0) {
        operator = operatorStack.pop();
        right = outputQueue.pop();
        left = outputQueue.pop();
        outputQueue.push(`(${operator} ${left} ${right})`);
    }

    return outputQueue[0];
}

function convertOperations(tokens) {
    const normalizedTokens = normalizeTokens(tokens);
    const chainTokens = identifyOperatorChains(normalizedTokens);

    for (const token of chainTokens) {
        if (token.type === 'chain') {
            token.type = 'enclosure';
            token.value = shuntingYard(token.tokens);
            delete token.tokens;
        }
    }

    return chainTokens;
}

function parseCommands(tokens) {
    if (!tokens.length) return [];

    const commands = { show: '#', if: '?', sort: '>>' };

    const name = commands[tokens[0].value.toLowerCase()];

    if (!name) return tokens;

    tokens = convertOperations(tokens);

    let currentElement = { name, flags: {}, args: [] };
    let currentFlag = '';
    const elements = [];

    const dummies = ['by', 'then', 'with'];
    const flags = ['as', 'of', 'sort', 'in', 'asc', 'desc', 'heading', 'label', 'otherwise'];
    const aliases = {
        sorted: 'sort',
        order: 'sort',
        ordered: 'sort',
        ascending: 'asc',
        descending: 'desc',
        else: 'otherwise',
    };

    for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        const value = token.value.toLowerCase();

        if (token.type == 'text') {
            if (value in commands) {
                elements.push(currentElement);
                currentElement = { name: commands[value], flags: {}, args: [] };
                currentFlag = '';
            } else if (flags.includes(value)) {
                currentFlag = value;
                currentElement.flags[currentFlag] = true;
            } else if (value in aliases) {
                currentFlag = aliases[value];
                currentElement.flags[currentFlag] = true;
            } else if (!currentFlag) {
                if (!dummies.includes(value)) {
                    currentElement.args.push(token);
                }
            } else if (!dummies.includes(value)) {
                currentElement.flags[currentFlag] = token;
                currentFlag = '';
            }
        } else {
            if (!currentFlag) {
                currentElement.args.push(token);
            } else {
                currentElement.flags[currentFlag] = token;
                currentFlag = '';
            }
        }
    }

    elements.push(currentElement);

    // Bring the first "if" to the front
    for (let i = 0; i < elements.length; i++) {
        if (elements[i].name == '?') {
            // Move the element at index `index` to the start of `array`
            if (i > 0) elements.unshift(...elements.splice(i, 1));
            break;
        }
    }

    const firstCmd = elements.shift();

    for (const elem of elements) {
        const extras = convertCommand(elem).map((item) => item.value);
        firstCmd.args.push({ type: 'enclosure', value: '(' + extras.join(' ') + ')' });
    }

    // When the first element is an IF command, there can be an
    // "otherwise" expression. To be flexible, we let the "otherwise"
    // statement appear anywhere, and make it into a flag, so we can
    // find it as a post-process step. Eg
    // {if a > b show a, sorted by x, otherwise 'hi'}
    // Here, "otherwise='hi'" is a flag of the show command but meant for the if command
    // The case {if a > b show a, sorted by x, otherwise show 'hi'} is different
    // because "otherwise=true", and `show 'hi'` is a separate command, and that
    // is already set as the 3rd argument of the if command
    if (firstCmd.name == '?' && firstCmd.args.length == 2) {
        for (const elem of elements) {
            if ('otherwise' in elem.flags) {
                firstCmd.args.push(elem.flags.otherwise);
                break;
            }
        }
    }

    return convertCommand(firstCmd);
}

function convertCommand(command) {
    const tokens = [{ type: 'text', value: command.name }];

    for (const arg of command.args) {
        tokens.push(arg);
    }

    for (const key in command.flags) {
        const token = command.flags[key];

        if (token === true) {
            tokens.push({ type: 'text', value: '-' + key });
        } else {
            tokens.push({ type: 'text', value: '-' + key + '=' }, token);
        }
    }

    return tokens;
}
