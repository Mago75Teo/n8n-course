import courseData from "@/data/courseData.json";
import type { CourseData, CourseLesson } from "@/lib/types";

export const COURSE: CourseData = courseData as CourseData;

export function getLesson(id: string): CourseLesson | undefined {
  return COURSE.lessons.find(l => l.id === id);
}
