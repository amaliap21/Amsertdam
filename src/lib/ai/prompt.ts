export type AnalysisResult = {
    verdict: "correct" | "partially_correct" | "incorrect";
    score: number;                  // 0-100
    feedback: string;               // ≤ 2 sentences
    mistakes: string[];             // empty if correct
    concept: string;                // ≤ 2 sentences explaining the underlying idea
};

// Short, directive system prompt = fewer input tokens every call.
// CRITICAL: when a correct answer is provided, the verdict MUST be graded
// against it — the model must not invent its own opinion of correctness.
export const SYSTEM_PROMPT = [
    "You are a concise, accurate study grader.",
    "You may be given the official correct answer.",
    "If a correct answer is provided, grade the student STRICTLY against it:",
    "mark 'correct' only when the student's answer matches the correct",
    "answer's meaning; mark 'incorrect' when it selects or states something",
    "different; 'partially_correct' only when it captures part of the correct",
    "answer but misses or contradicts the rest.",
    "Do NOT call an answer correct just because it sounds plausible — compare",
    "it to the provided correct answer.",
    "Then explain briefly. Keep every field short and in the student's language.",
    "Respond ONLY with JSON matching this schema:",
    `{"verdict":"correct|partially_correct|incorrect","score":0-100,`,
    `"feedback":"≤2 sentences","mistakes":["short strings"],`,
    `"concept":"≤2 sentences"}`,
].join(" ");

export function buildUserMessage(input: {
    subject?: string;
    question: string;
    userAnswer: string;
    correctAnswer?: string;
}): string {
    // Compact; no filler tokens. The correct answer (when known) is the
    // grading key — label it clearly so the model treats it as ground truth.
    return [
        input.subject ? `Subject: ${input.subject}` : null,
        `Question: ${input.question}`,
        input.correctAnswer ? `Correct answer (ground truth): ${input.correctAnswer}` : null,
        `Student answer: ${input.userAnswer}`,
    ]
        .filter(Boolean)
        .join("\n");
}

// Defensive parse — free models sometimes wrap JSON in prose/code fences.
export function parseAnalysis(raw: string): AnalysisResult | null {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        const obj = JSON.parse(match[0]);
        if (
            ["correct", "partially_correct", "incorrect"].includes(obj.verdict) &&
            typeof obj.feedback === "string"
        ) {
            return {
                verdict: obj.verdict,
                score: Math.max(0, Math.min(100, Number(obj.score) || 0)),
                feedback: String(obj.feedback).slice(0, 400),
                mistakes: Array.isArray(obj.mistakes) ? obj.mistakes.slice(0, 5).map(String) : [],
                concept: String(obj.concept ?? "").slice(0, 400),
            };
        }
    } catch {
        /* fall through */
    }
    return null;
}