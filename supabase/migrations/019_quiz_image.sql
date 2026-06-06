-- 019_quiz_image.sql
-- Store the source image for image-generated quizzes so the quiz page can show
-- it (questions reference "the image").
alter table quizzes add column if not exists image_url text;
