-- Create task boards
CREATE TABLE IF NOT EXISTS public.task_boards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_boards TO authenticated;
GRANT ALL ON public.task_boards TO service_role;

ALTER TABLE public.task_boards ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage their own task boards" 
  ON public.task_boards 
  FOR ALL 
  USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- Create task columns
CREATE TABLE IF NOT EXISTS public.task_columns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  board_id UUID NOT NULL REFERENCES public.task_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#94a3b8',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_columns TO authenticated;
GRANT ALL ON public.task_columns TO service_role;

ALTER TABLE public.task_columns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage columns on their boards" 
  ON public.task_columns 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM public.task_boards 
    WHERE id = task_columns.board_id AND user_id = auth.uid()
  ));
EXCEPTION WHEN others THEN NULL; END $$;

-- Update tasks table to support boards and positions
DO $$ BEGIN
  ALTER TABLE public.tasks ADD COLUMN board_id UUID REFERENCES public.task_boards(id) ON DELETE SET NULL;
  ALTER TABLE public.tasks ADD COLUMN column_id UUID REFERENCES public.task_columns(id) ON DELETE SET NULL;
  ALTER TABLE public.tasks ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE public.tasks ADD COLUMN tags TEXT[] DEFAULT '{}';
EXCEPTION WHEN others THEN NULL; END $$;

-- Create checklists for tasks
CREATE TABLE IF NOT EXISTS public.task_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_checklists TO authenticated;
GRANT ALL ON public.task_checklists TO service_role;

ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can manage checklists for their tasks" 
  ON public.task_checklists 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE id = task_checklists.task_id AND user_id = auth.uid()
  ));
EXCEPTION WHEN others THEN NULL; END $$;

-- Create comments for tasks
CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view comments on accessible tasks" 
  ON public.task_comments 
  FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE id = task_comments.task_id AND (user_id = auth.uid() OR is_admin() OR is_gestor())
  ));
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert comments on accessible tasks" 
  ON public.task_comments 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can update their own comments" 
  ON public.task_comments 
  FOR UPDATE 
  USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users can delete their own comments" 
  ON public.task_comments 
  FOR DELETE 
  USING (auth.uid() = user_id);
EXCEPTION WHEN others THEN NULL; END $$;

-- Create activity log for tasks
CREATE TABLE IF NOT EXISTS public.task_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  activity_type TEXT NOT NULL, 
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.task_activities TO authenticated;
GRANT ALL ON public.task_activities TO service_role;

ALTER TABLE public.task_activities ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view activity for accessible tasks" 
  ON public.task_activities 
  FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.tasks 
    WHERE id = task_activities.task_id AND (user_id = auth.uid() OR is_admin() OR is_gestor())
  ));
EXCEPTION WHEN others THEN NULL; END $$;

-- Trigger for updated_at
DO $$ BEGIN
  CREATE TRIGGER update_task_boards_updated_at BEFORE UPDATE ON public.task_boards FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_task_columns_updated_at BEFORE UPDATE ON public.task_columns FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_task_checklists_updated_at BEFORE UPDATE ON public.task_checklists FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER update_task_comments_updated_at BEFORE UPDATE ON public.task_comments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
EXCEPTION WHEN others THEN NULL; END $$;

-- Migrate existing tasks: 
-- 1. Create a default board for each user who has tasks
-- 2. Create default columns for those boards
-- 3. Assign tasks to those boards/columns based on status

DO $$
DECLARE
    user_rec RECORD;
    v_board_id UUID;
    v_backlog_id UUID;
    v_todo_id UUID;
    v_doing_id UUID;
    v_done_id UUID;
BEGIN
    FOR user_rec IN SELECT DISTINCT user_id FROM public.tasks WHERE board_id IS NULL LOOP
        -- Create default board
        INSERT INTO public.task_boards (name, user_id, is_default)
        VALUES ('Meu Quadro', user_rec.user_id, true)
        RETURNING id INTO v_board_id;

        -- Create columns
        INSERT INTO public.task_columns (board_id, name, color, position) VALUES (v_board_id, 'Backlog', '#94a3b8', 0) RETURNING id INTO v_backlog_id;
        INSERT INTO public.task_columns (board_id, name, color, position) VALUES (v_board_id, 'A Fazer', '#3b82f6', 1) RETURNING id INTO v_todo_id;
        INSERT INTO public.task_columns (board_id, name, color, position) VALUES (v_board_id, 'Em Andamento', '#f59e0b', 2) RETURNING id INTO v_doing_id;
        INSERT INTO public.task_columns (board_id, name, color, position) VALUES (v_board_id, 'Concluído', '#10b981', 3) RETURNING id INTO v_done_id;

        -- Update tasks
        UPDATE public.tasks 
        SET board_id = v_board_id,
            column_id = CASE 
                WHEN status = 'concluida' THEN v_done_id
                WHEN status = 'em_andamento' THEN v_doing_id
                WHEN status = 'pendente' THEN v_todo_id
                ELSE v_backlog_id
            END
        WHERE user_id = user_rec.user_id AND board_id IS NULL;
    END LOOP;
END $$;
