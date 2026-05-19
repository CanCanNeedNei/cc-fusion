/**
 * transcript.ts — Parse transcript JSONL for tool stats
 */
import { openSync, readSync, closeSync, statSync } from 'fs';
const DEFAULT_TAIL_BYTES = 1024 * 512;
function emptyStats() {
    return {
        lastRead: undefined,
        lastEdit: undefined,
        lastSearch: undefined,
        agents: [],
        todos: [],
        totalTodos: 0,
        doneTodos: 0,
    };
}
function readTailLines(filePath, maxLines, maxBytes = DEFAULT_TAIL_BYTES) {
    const stat = statSync(filePath);
    if (stat.size === 0)
        return [];
    const bytesToRead = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(filePath, 'r');
    try {
        readSync(fd, buffer, 0, bytesToRead, stat.size - bytesToRead);
    }
    finally {
        closeSync(fd);
    }
    return buffer.toString('utf-8').split('\n').filter(Boolean).slice(-maxLines);
}
function collectToolUses(entry) {
    const toolUses = [];
    if (entry.type === 'tool_use') {
        toolUses.push(entry);
    }
    const content = (entry.type === 'assistant' || entry.type === 'user' || entry.type === 'system')
        ? entry.message?.content
        : undefined;
    if (Array.isArray(content)) {
        for (const item of content) {
            if (item.type === 'tool_use') {
                toolUses.push(item);
            }
        }
    }
    return toolUses;
}
function fileFromTool(tool) {
    const input = tool.input || {};
    const value = input.file_path || input.path || input.notebook_path;
    return typeof value === 'string' && value ? value : undefined;
}
function parseTaskId(value) {
    if (typeof value === 'number' && Number.isInteger(value))
        return value;
    if (typeof value !== 'string')
        return undefined;
    const id = parseInt(value, 10);
    return Number.isNaN(id) ? undefined : id;
}
function textFromValue(value) {
    if (typeof value === 'string')
        return value;
    if (!Array.isArray(value))
        return undefined;
    const parts = [];
    for (const item of value) {
        if (typeof item === 'string') {
            parts.push(item);
        }
        else if (typeof item === 'object' && item !== null && 'text' in item) {
            const text = item.text;
            if (typeof text === 'string')
                parts.push(text);
        }
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}
function shouldStartNewTaskBatch(todoMap) {
    return todoMap.size > 0 && Array.from(todoMap.values()).every(todo => todo.status === 'done');
}
function addCreatedTask(todoMap, taskId, subject) {
    if (todoMap.has(taskId))
        return;
    if (shouldStartNewTaskBatch(todoMap)) {
        todoMap.clear();
    }
    todoMap.set(taskId, {
        id: taskId,
        name: subject.slice(0, 30),
        status: 'pending',
    });
}
function collectToolResultTexts(entry) {
    const results = [];
    const content = (entry.type === 'assistant' || entry.type === 'user' || entry.type === 'system')
        ? entry.message?.content
        : undefined;
    if (!Array.isArray(content))
        return results;
    for (const item of content) {
        if (item.type !== 'tool_result')
            continue;
        const text = textFromValue(item.content);
        if (!text)
            continue;
        results.push({
            toolUseId: typeof item.tool_use_id === 'string' ? item.tool_use_id : undefined,
            text,
        });
    }
    return results;
}
/**
 * Parse a transcript JSONL file and extract tool usage statistics.
 */
export function parseTranscript(filePath, maxLines = 500) {
    const empty = emptyStats();
    if (!filePath)
        return empty;
    try {
        const tail = readTailLines(filePath, maxLines);
        let lastRead;
        let lastEdit;
        let lastSearch;
        const agentMap = new Map();
        const todoMap = new Map();
        const taskCreateSubjects = new Map();
        const pendingTaskCreateToolIds = [];
        for (const line of tail) {
            let entry;
            try {
                entry = JSON.parse(line);
            }
            catch {
                continue;
            }
            for (const result of collectToolResultTexts(entry)) {
                const match = result.text.match(/Task #(\d+) created successfully/i);
                if (!match)
                    continue;
                const taskId = parseTaskId(match[1]);
                if (taskId === undefined)
                    continue;
                const toolId = result.toolUseId || pendingTaskCreateToolIds.shift();
                if (!toolId)
                    continue;
                if (result.toolUseId) {
                    const pendingIndex = pendingTaskCreateToolIds.indexOf(result.toolUseId);
                    if (pendingIndex !== -1)
                        pendingTaskCreateToolIds.splice(pendingIndex, 1);
                }
                const subject = taskCreateSubjects.get(toolId);
                if (!subject)
                    continue;
                addCreatedTask(todoMap, taskId, subject);
            }
            const toolUses = collectToolUses(entry);
            for (const tool of toolUses) {
                const name = (tool.name || '').toLowerCase();
                // Track last read
                if (name === 'read') {
                    const fp = fileFromTool(tool);
                    if (fp)
                        lastRead = fp;
                }
                // Track last edit
                if (['edit', 'multiedit', 'write', 'notebookedit'].includes(name)) {
                    const fp = fileFromTool(tool);
                    if (fp)
                        lastEdit = fp;
                }
                // Track last search (grep)
                if (name === 'grep' || name === 'glob') {
                    const pattern = tool.input?.pattern || tool.input?.query;
                    if (typeof pattern === 'string')
                        lastSearch = pattern;
                }
                // Track agents
                if (name === 'agent' || name === 'task') {
                    const agentName = tool.input?.subagent_type || tool.input?.description || 'Agent';
                    const agentId = tool.id;
                    if (!agentMap.has(agentId)) {
                        const colors = ['green', 'orange', 'blue', 'purple', 'white'];
                        const color = colors[agentMap.size % colors.length];
                        agentMap.set(agentId, {
                            name: String(agentName).slice(0, 20),
                            status: '运行中',
                            color,
                        });
                    }
                }
                // Track todos from TaskCreate/TaskUpdate
                if (name === 'taskcreate') {
                    const subject = tool.input?.subject;
                    if (typeof subject === 'string') {
                        taskCreateSubjects.set(tool.id, subject);
                        pendingTaskCreateToolIds.push(tool.id);
                        const taskId = parseTaskId(tool.input?.taskId ?? tool.input?.id);
                        if (taskId !== undefined) {
                            addCreatedTask(todoMap, taskId, subject);
                        }
                    }
                }
                if (name === 'taskupdate') {
                    const taskId = parseTaskId(tool.input?.taskId);
                    const status = tool.input?.status;
                    if (taskId !== undefined && typeof status === 'string') {
                        const existing = todoMap.get(taskId);
                        if (existing) {
                            if (status === 'completed') {
                                existing.status = 'done';
                            }
                            else if (status === 'in_progress') {
                                existing.status = 'current';
                            }
                        }
                    }
                }
            }
        }
        const agents = Array.from(agentMap.values()).slice(-5); // Keep last 5 agents
        const todos = Array.from(todoMap.values())
            .slice(-5)
            .map((todo, index) => ({ ...todo, id: index + 1 }));
        const doneTodos = todos.filter(t => t.status === 'done').length;
        return {
            lastRead,
            lastEdit,
            lastSearch,
            agents,
            todos,
            totalTodos: todos.length,
            doneTodos,
        };
    }
    catch {
        return empty;
    }
}
/**
 * Try multiple transcript path patterns.
 */
export function findTranscript(sessionId, cwd, explicitPath) {
    if (explicitPath) {
        try {
            statSync(explicitPath);
            return explicitPath;
        }
        catch { /* try inferred paths */ }
    }
    if (!sessionId || !cwd)
        return null;
    const home = process.env.HOME || '/root';
    const encoded = cwd.replace(/\//g, '-').replace(/^-/, '');
    const candidates = [
        `${home}/.claude/projects/${encoded}/${sessionId}.jsonl`,
        `${home}/.claude/projects/-${encoded}/${sessionId}.jsonl`,
        `${home}/.claude/projects/${encoded}/sessions/${sessionId}/transcript.jsonl`,
        `${home}/.claude/projects/-${encoded}/sessions/${sessionId}/transcript.jsonl`,
    ];
    const rawParts = cwd.split('/').filter(Boolean);
    for (const part of rawParts) {
        candidates.push(`${home}/.claude/projects/${part}/${sessionId}.jsonl`, `${home}/.claude/projects/${part}/sessions/${sessionId}/transcript.jsonl`);
    }
    for (const p of candidates) {
        try {
            statSync(p);
            return p;
        }
        catch {
            continue;
        }
    }
    return null;
}
//# sourceMappingURL=transcript.js.map