export type CourseLesson = {
  id: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  estMin: number;
  objectives: string[];
  tags: string[];
  contentHtml: string;
};

export type CourseModule = {
  id: string;
  title: string;
  description?: string;
  lessonIds: string[];
};

export type CourseData = {
  version: string;
  generatedAt: string;
  modules: CourseModule[];
  lessons: CourseLesson[];
};

export type ProgressData = {
  completed: Record<string, boolean>;
  notes: Record<string, string>;
  plan: null | {
    focus: "balanced" | "marketing" | "api" | "ai";
    hoursPerWeek: number;
    minsPerWeek: number;
    weeks: { week: number; minutes: number; lessonIds: string[] }[];
    createdAt: string;
  };
  startedAt: string;
  updatedAt?: string;
};
