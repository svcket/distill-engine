export type Status = 'done' | 'processing' | 'failed' | 'idle' | 'rejected' | 'pending';

export interface SourceCandidate {
    id: string;
    title: string;
    channel: string;
    url: string;
    duration: string;
    published: string;
    status: Status;
    score: number;
    source_type?: string;
    thumbnail?: string;
    completedStages?: string[];
}

export interface TranscriptChunk {
    id: string;
    startTime: string;
    endTime: string;
    text: string;
}

export interface ActivityLog {
    id: string;
    action: string;
    sourceTitle: string;
    time: string;
    status: Status;
}

export const recentSources: SourceCandidate[] = [
    {
        id: 'src_102',
        title: 'The Architecture of AI Agents: Patterns & Anti-patterns',
        channel: 'Stanford Seminar Series',
        url: 'https://youtube.com/watch?v=1',
        duration: '1:02:14',
        published: '3 days ago',
        status: 'done',
        score: 9.4,
    },
    {
        id: 'src_103',
        title: 'Designing for Vibe Coders in 2026',
        channel: 'DevTools Design',
        url: 'https://youtube.com/watch?v=1',
        duration: '45:00',
        published: '1 day ago',
        status: 'processing',
        score: 8.8,
    },
    {
        id: 'src_104',
        title: 'Stop Building Bloated Dashboards',
        channel: 'Product Thinking',
        url: 'https://youtube.com/watch?v=1',
        duration: '22:10',
        published: '5 days ago',
        status: 'pending',
        score: 7.2,
    },
    {
        id: 'src_105',
        title: 'Why Most LLM Wrappers Fail: A Technical Deep Dive',
        channel: 'AI Engineers Club',
        url: 'https://youtube.com/watch?v=1',
        duration: '1:15:30',
        published: '2 weeks ago',
        status: 'rejected',
        score: 4.5,
    },
];

export const pipelineActivity: ActivityLog[] = [
    { id: 'act_1', action: 'Exported Thread', sourceTitle: 'The Architecture of AI Agents...', time: '2 mins ago', status: 'done' },
    { id: 'act_2', action: 'Drafting Long Article', sourceTitle: 'Stop Building Bloated...', time: '14 mins ago', status: 'processing' },
    { id: 'act_3', action: 'Fact Review Failed', sourceTitle: 'Why Most LLM Wrappers Fail...', time: '1 hour ago', status: 'failed' },
    { id: 'act_4', action: 'Extracted Insights', sourceTitle: 'Designing for Vibe Coders...', time: '3 hours ago', status: 'done' },
];

export const mockInsights = {
    id: 'ins_998',
    sourceId: 'src_102',
    thesis: 'LLM agents are moving from brittle prompt-chains to resilient architectures based on structured state machines and tool-calling validation.',
    frameworks: [
        { title: 'The Reflection Loop', description: 'Agent executes tool -> Validates structural output -> Feeds error state back as prompt if invalid -> Proceeds only on valid state.' },
        { title: 'Context Horizons', description: 'Hard limits on token memory vs soft limits on semantic retrieval relevance. Mixing both creates stable long-term reasoning.' }
    ],
    takeaways: [
        'Stop telling LLMs to "be smart" and start giving them type-safe JSON schema boundaries.',
        'Agentic failure usually happens because humans don\'t write good recovery paths, not because the model is dumb.'
    ],
    quotes: [
        "We are building systems that act like nervous systems, but we treat them like calculators. That's why they break.",
        "If your agent doesn't have an explicit 'stop and ask the user' state, it's not an agent; it's a runaway train."
    ]
};

export const mockDrafts = {
    id: 'drf_234',
    sourceId: 'src_102',
    short: 'LLM agents have evolved past brittle prompts. The most reliable architectures now rely on structural state machines and explicit reflection loops. If your agent doesn\'t validate tool output or know how to stop and ask for human help, you are building a runaway train, not an intelligent system.',
    thread: [
        '1/ Most AI agents built today are just brittle prompt-chains waiting to break. \n\nWe sat down at the Stanford Seminar to break down what actually works in production agent architectures 👇',
        '2/ The Reflection Loop.\n\nSmart systems don\'t just blindly pass outputs. \nThey execute -> validate schema -> feed errors back into the prompt if invalid.\n\nOnly clean state gets passed forward.',
        '3/ Stop telling models to "be smart".\n\nStart giving them type-safe JSON boundaries and explicit recovery paths. The model is rarely the problem—the fragile architecture around it is.',
    ],
    long: `# Resilience in Agentic Architecture\n\nWe are currently in a transition period for LLM applications. The era of brittle, optimistic prompt-chaining is ending, and the era of structured, resilient state machines is beginning.\n\n## The Core Problem\n\nAs discussed in the recent Stanford Seminar, we are building systems that act like nervous systems, but we manage them as if they were simple calculators.`
};
