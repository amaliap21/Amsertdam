// Minimal Supabase schema definitions for the tables this app touches.
// Each table only declares what we actually read/write — anything stored as
// JSON inside the `title` column (see api/courses, api/tasks) is decoded on
// the application layer, not at the DB layer.

type IsoTimestamp = string;

export type Database = {
  public: {
    Tables: {
      tasks: {
        Row: {
          id: string;
          title: string;
          created_at: IsoTimestamp;
        };
        Insert: {
          id?: string;
          title: string;
          created_at?: IsoTimestamp;
        };
        Update: {
          id?: string;
          title?: string;
          created_at?: IsoTimestamp;
        };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          title: string;
          created_at: IsoTimestamp;
        };
        Insert: {
          id?: string;
          title: string;
          created_at?: IsoTimestamp;
        };
        Update: {
          id?: string;
          title?: string;
          created_at?: IsoTimestamp;
        };
        Relationships: [];
      };
      assessments: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          course_id: string | null;
          created_at: IsoTimestamp;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          course_id?: string | null;
          created_at?: IsoTimestamp;
        };
        Update: Partial<Database["public"]["Tables"]["assessments"]["Insert"]>;
        Relationships: [];
      };
      items: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          assessment_id: string | null;
          created_at: IsoTimestamp;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          assessment_id?: string | null;
          created_at?: IsoTimestamp;
        };
        Update: Partial<Database["public"]["Tables"]["items"]["Insert"]>;
        Relationships: [];
      };
      flashcard_decks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          card_count: number;
          cards: Array<{ front: string; back: string }>;
          created_at: IsoTimestamp;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          card_count: number;
          cards: Array<{ front: string; back: string }>;
          created_at?: IsoTimestamp;
        };
        Update: Partial<Database["public"]["Tables"]["flashcard_decks"]["Insert"]>;
        Relationships: [];
      };
      quizzes: {
        Row: {
          id: string;
          title: string;
          course: string;
          source: string;
          questions: Array<{
            id: string;
            prompt: string;
            options: Array<{ letter: "A" | "B" | "C" | "D"; text: string }>;
            correctAnswer: "A" | "B" | "C" | "D";
          }>;
          created_at: IsoTimestamp;
        };
        Insert: {
          id?: string;
          title: string;
          course: string;
          source: string;
          questions: Database["public"]["Tables"]["quizzes"]["Row"]["questions"];
          created_at?: IsoTimestamp;
        };
        Update: Partial<Database["public"]["Tables"]["quizzes"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
