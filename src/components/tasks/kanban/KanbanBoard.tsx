import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Plus, MoreVertical, Calendar, User, DollarSign, Tag, 
  MessageSquare, CheckSquare, Pencil, Trash2 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ColumnModal from './ColumnModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const db = supabase as any;

interface KanbanBoardProps {
  onTaskClick: (task: any) => void;
  onAddTask: (columnId: string, status: string) => void;
  refreshTrigger: number;
}

export default function KanbanBoard({ onTaskClick, onAddTask, refreshTrigger }: KanbanBoardProps) {
  const [columns, setColumns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [columnModal, setColumnModal] = useState<{
    isOpen: boolean;
    title: string;
    initialName: string;
    initialColor: string;
    columnId?: string;
  }>({
    isOpen: false,
    title: 'Criar nova coluna',
    initialName: '',
    initialColor: '#94a3b8'
  });
  const [deleteAlert, setDeleteAlert] = useState<{
    isOpen: boolean;
    columnId: string;
    tasksCount: number;
  }>({
    isOpen: false,
    columnId: '',
    tasksCount: 0
  });

  const loadData = async () => {
    try {
      const { data: boards } = await db.from('task_boards').select('id').eq('is_default', true).single();
      if (!boards) return;

      const { data: cols } = await db.from('task_columns')
        .select('*')
        .eq('board_id', boards.id)
        .order('position', { ascending: true });

      const { data: tasks } = await db.from('tasks')
        .select(`
          *,
          quote:quotes(quote_number, client_name, total),
          client:clients(name),
          checklist:task_checklists(id, is_completed),
          comments:task_comments(id)
        `)
        .eq('board_id', boards.id)
        .order('position', { ascending: true });

      const columnsWithTasks = (cols || []).map(col => ({
        ...col,
        tasks: (tasks || []).filter(t => t.column_id === col.id)
      }));

      setColumns(columnsWithTasks);
    } catch (error) {
      console.error('Error loading Kanban data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [refreshTrigger]);

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId, type } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    // Reorder locally first
    const newColumns = [...columns];
    const sourceCol = newColumns.find(c => c.id === source.droppableId);
    const destCol = newColumns.find(c => c.id === destination.droppableId);

    if (!sourceCol || !destCol) return;

    const [movedTask] = sourceCol.tasks.splice(source.index, 1);
    destCol.tasks.splice(destination.index, 0, movedTask);
    setColumns(newColumns);

    // Update DB
    try {
      const { error } = await db.from('tasks')
        .update({ 
          column_id: destination.droppableId,
          position: destination.index,
          status: destCol.name.toLowerCase().includes('conclu') ? 'concluida' : 
                  destCol.name.toLowerCase().includes('andamento') ? 'em_andamento' : 
                  movedTask.status
        })
        .eq('id', draggableId);

      if (error) throw error;
      
      // Add activity history
      if (source.droppableId !== destination.droppableId) {
        await db.from('task_activities').insert({
          task_id: draggableId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          activity_type: 'task_moved',
          old_value: sourceCol.name,
          new_value: destCol.name
        });
      }
    } catch (error: any) {
      toast.error('Erro ao mover tarefa: ' + error.message);
      loadData(); // Revert
    }
  };

  const handleAddColumn = () => {
    setColumnModal({
      isOpen: true,
      title: 'Criar nova coluna',
      initialName: '',
      initialColor: '#94a3b8'
    });
  };

  const handleRenameColumn = (columnId: string, currentName: string, currentColor: string) => {
    setColumnModal({
      isOpen: true,
      title: 'Editar coluna',
      initialName: currentName,
      initialColor: currentColor || '#94a3b8',
      columnId
    });
  };

  const onSaveColumn = async (name: string, color: string) => {
    try {
      if (columnModal.columnId) {
        // Update
        const { error } = await db.from('task_columns').update({ name, color }).eq('id', columnModal.columnId);
        if (error) throw error;
        toast.success('Coluna atualizada!');
      } else {
        // Create
        const { data: boards } = await db.from('task_boards').select('id').eq('is_default', true).single();
        if (!boards) return;

        const { error } = await db.from('task_columns').insert({
          name,
          board_id: boards.id,
          position: columns.length,
          color
        });

        if (error) throw error;
        toast.success('Coluna criada!');
      }
      loadData();
    } catch (error: any) {
      toast.error('Erro ao salvar coluna: ' + error.message);
    }
  };

  const confirmDeleteColumn = async () => {
    try {
      const { error } = await db.from('task_columns').delete().eq('id', deleteAlert.columnId);
      if (error) throw error;
      toast.success('Coluna excluída!');
      loadData();
    } catch (error: any) {
      toast.error('Erro ao excluir coluna: ' + error.message);
    }
  };

  if (loading) return <div className="p-8 text-center">Carregando quadro...</div>;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex h-full gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted">
        {columns.map(column => (
          <div key={column.id} className="flex flex-col min-w-[300px] max-w-[350px] w-full bg-muted/30 rounded-xl p-3">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: column.color }} />
                <h3 className="font-semibold text-sm uppercase tracking-wider">{column.name}</h3>
                <Badge variant="secondary" className="ml-1 text-[10px]">{column.tasks.length}</Badge>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleRenameColumn(column.id, column.name, column.color)}>
                    <Pencil className="h-4 w-4 mr-2" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDeleteAlert({ isOpen: true, columnId: column.id, tasksCount: column.tasks.length })} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 space-y-3 min-h-[200px] transition-colors rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-muted/50' : ''}`}
                >
                  {column.tasks.map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id} index={index}>
                      {(provided, snapshot) => (
                        <Card
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          onClick={() => onTaskClick(task)}
                          className={`shadow-sm border-l-4 hover:shadow-md transition-all cursor-pointer group ${
                            snapshot.isDragging ? 'rotate-2 scale-105 shadow-xl ring-2 ring-primary' : ''
                          } ${
                            task.priority === 'alta' ? 'border-l-red-500 shadow-[0_0_8px_rgba(239,68,68,0.1)]' : 
                            task.priority === 'média' ? 'border-l-yellow-500' : 'border-l-slate-300'
                          }`}
                        >
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <h4 className="font-medium text-sm leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                                {task.title}
                              </h4>
                            </div>

                            {(task.quote || task.client) && (
                              <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                                {task.client && (
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    <span>{task.client.name}</span>
                                  </div>
                                )}
                                {task.quote && (
                                  <div className="flex items-center gap-1 text-primary">
                                    <Tag className="h-3 w-3" />
                                    <span>#{task.quote.quote_number}</span>
                                    {task.quote.total && (
                                      <span className="ml-auto font-semibold text-emerald-600">
                                        R$ {task.quote.total.toLocaleString('pt-BR')}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1">
                              <div className="flex gap-2">
                                {task.due_date && (
                                  <Badge variant="outline" className={`text-[10px] py-0 h-5 px-1.5 gap-1 ${
                                    new Date(task.due_date) < new Date() && task.status !== 'concluida' ? 'text-red-600 border-red-200 bg-red-50' : ''
                                  }`}>
                                    <Calendar className="h-3 w-3" />
                                    {format(new Date(task.due_date), 'dd/MM')}
                                  </Badge>
                                )}
                                <div className="flex items-center gap-2">
                                  {task.checklist && task.checklist.length > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
                                      <CheckSquare className="h-3 w-3" />
                                      {task.checklist.filter((i: any) => i.is_completed).length}/{task.checklist.length}
                                    </div>
                                  )}
                                  {task.comments && task.comments.length > 0 && (
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-md">
                                      <MessageSquare className="h-3 w-3" />
                                      {task.comments.length}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex -space-x-1.5">
                                <div className="w-5 h-5 rounded-full bg-accent text-accent-foreground text-[8px] flex items-center justify-center border-2 border-background font-bold">
                                  {task.user_id?.substring(0, 1).toUpperCase() || 'M'}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
            
            <Button 
              variant="ghost" 
              className="w-full justify-start text-muted-foreground hover:text-foreground mt-2 h-9 text-xs" 
              onClick={() => {
                const status = column.name.toLowerCase().includes('conclu') ? 'concluida' : 
                               column.name.toLowerCase().includes('andamento') ? 'em_andamento' : 'pendente';
                onAddTask(column.id, status);
              }}
            >
              <Plus className="h-3 w-3 mr-2" /> Adicionar tarefa
            </Button>
          </div>
        ))}

        <div className="min-w-[300px] border-2 border-dashed rounded-xl flex items-center justify-center p-6 text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer" onClick={handleAddColumn}>
          <div className="text-center">
            <Plus className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-medium">Nova Coluna</p>
          </div>
        </div>
      </div>

      <ColumnModal
        isOpen={columnModal.isOpen}
        onClose={() => setColumnModal(prev => ({ ...prev, isOpen: false }))}
        onSave={onSaveColumn}
        title={columnModal.title}
        initialName={columnModal.initialName}
        initialColor={columnModal.initialColor}
        existingNames={columns.map(c => c.name)}
      />

      <AlertDialog open={deleteAlert.isOpen} onOpenChange={(open) => setDeleteAlert(prev => ({ ...prev, isOpen: open }))}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja excluir esta coluna?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAlert.tasksCount > 0 
                ? `Esta coluna possui ${deleteAlert.tasksCount} tarefas. Elas serão excluídas permanentemente. Esta ação não pode ser desfeita.` 
                : "Esta ação excluirá a coluna permanentemente do seu quadro Kanban."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteColumn} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl">
              Excluir Coluna
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DragDropContext>
  );
}
