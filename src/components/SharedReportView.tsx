import { useParams } from 'react-router-dom';

interface SharedReportViewProps {
  editMode?: boolean;
}

export function SharedReportView({ editMode = false }: SharedReportViewProps) {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center text-slate-500">
        <p className="text-lg font-medium">Loading report{editMode ? ' (edit mode)' : ''}…</p>
        <p className="text-sm mt-1 text-slate-400">{id}</p>
      </div>
    </div>
  );
}
