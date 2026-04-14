/**
 * Walk a ProseMirror-style content tree and instantiate {placeholders}
 * in text nodes using a template engine.
 *
 * @param {Object|Array} content - ProseMirror document or content array.
 *   Shape: { type: 'doc', content: [...] } or an array of nodes.
 * @param {Object} engine - A Loom instance (or any engine with a render method).
 * @param {Function} vars - Variable resolver: (key) => value.
 * @returns {Object|Array} The content tree with all text nodes instantiated.
 */
export function instantiateContent(content, engine, vars) {
    if (Array.isArray(content)) {
        return content.map((node) => instantiateNode(node, engine, vars))
    }

    if (!content || typeof content !== 'object') return content

    const innerContent = content.content
    if (!Array.isArray(innerContent)) return content

    return {
        ...content,
        content: innerContent.map((node) => instantiateNode(node, engine, vars)),
    }
}

/**
 * Instantiate a single ProseMirror node. Text nodes have their `text`
 * field run through engine.render(). Other nodes recurse into children.
 */
function instantiateNode(node, engine, vars) {
    if (!node || typeof node !== 'object') return node

    const { type, content, text } = node

    if (type === 'text' && typeof text === 'string') {
        return {
            ...node,
            text: engine.render(text, vars),
        }
    }

    if (content && Array.isArray(content)) {
        return {
            ...node,
            content: content.map((child) => instantiateNode(child, engine, vars)),
        }
    }

    return node
}
