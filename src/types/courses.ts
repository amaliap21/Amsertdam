// types/courses.ts
export type Assessment = {
    name: string;
    weight: number;
    score?: number;
    date?: string;
};

export type Requirement = {
    name: string;
    score: number;
};

export type Course = {
    courseName: string;
    credits: number;
    fromTime: number;
    toTime: number;
    typeTracking: string;
    threshold: number;
    assessments?: Assessment[];
    passingRequirement?: string;
    requirements?: Requirement[];
};