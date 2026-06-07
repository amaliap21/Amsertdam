-- 020_quiz_image_regions.sql
-- Label bounding boxes for image quizzes, so the quiz page can COVER the labels
-- (student answers without reading the answers off the diagram).
alter table quizzes add column if not exists image_regions jsonb;
