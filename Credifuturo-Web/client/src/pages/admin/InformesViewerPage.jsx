import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../config/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '../../components/ui/Button';
import { Card, CardContent } from '../../components/ui/Card';
import { ArrowLeft, Trash2, FileText, Loader2, AlertCircle } from 'lucide-react';
import { useUi } from '../../context/UiContext';

const InformesViewerPage = () => {
    const { filename } = useParams();
    const navigate = useNavigate();
    const { toast } = useUi();
    
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchReport = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get(`/admin/informes/${encodeURIComponent(filename)}`);
                setContent(res.data.content);
            } catch (err) {
                console.error('Error fetching report:', err.message);
                setError(err.response?.data?.error || 'Error al cargar el informe');
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [filename]);

    const handleDelete = async () => {
        if (window.confirm(`¿Estás seguro de eliminar permanentemente el informe "${filename}"?`)) {
            try {
                await api.delete(`/admin/informes/${encodeURIComponent(filename)}`);
                toast.success('Informe eliminado exitosamente');
                // Trigger sidebar refresh by dispatching a custom event
                window.dispatchEvent(new CustomEvent('informesUpdated'));
                navigate('/admin');
            } catch (err) {
                console.error('Error deleting report:', err.message);
                toast.error(err.response?.data?.error || 'Error al eliminar el informe');
            }
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
                <p className="text-gray-500 font-medium">Cargando documento...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6 -ml-2 text-gray-500 hover:text-gray-900">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Volver
                </Button>
                <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-lg flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 mt-0.5" />
                    <div>
                        <h3 className="font-bold text-lg mb-1">Informe no encontrado</h3>
                        <p>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto pb-12 space-y-6">
            {/* Cabecera del documento */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Volver" className="text-gray-500 hover:bg-gray-100">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                            <FileText className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 truncate max-w-lg" title={filename}>
                                {filename.replace(/\.md$/, '')}
                            </h1>
                            <p className="text-sm text-gray-500 flex items-center gap-2">
                                <span className="uppercase text-[10px] tracking-wider font-bold bg-gray-100 px-2 py-0.5 rounded text-gray-600">Markdown</span>
                                Documento guardado en sistema
                            </p>
                        </div>
                    </div>
                </div>
                
                <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50 w-full sm:w-auto" onClick={handleDelete}>
                    <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </Button>
            </div>

            {/* Contenido Renderizado */}
            <Card className="border-gray-200 shadow-sm overflow-hidden bg-white">
                <CardContent className="p-8 sm:p-12">
                    <div className="prose prose-blue max-w-none 
                        prose-headings:text-gray-900 prose-headings:font-bold 
                        prose-h1:text-3xl prose-h1:border-b prose-h1:pb-4 prose-h1:mb-6
                        prose-h2:text-2xl prose-h2:mt-8 prose-h2:mb-4
                        prose-h3:text-xl
                        prose-p:text-gray-700 prose-p:leading-relaxed
                        prose-a:text-brand-primary prose-a:no-underline hover:prose-a:underline
                        prose-strong:text-gray-900
                        prose-ul:list-disc prose-ol:list-decimal
                        prose-li:my-1
                        prose-blockquote:border-l-4 prose-blockquote:border-brand-primary prose-blockquote:bg-gray-50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:italic
                        prose-code:text-brand-primary prose-code:bg-gray-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:text-sm
                        prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg
                        prose-img:rounded-lg prose-img:shadow-sm
                        prose-table:w-full prose-table:border-collapse
                        prose-th:bg-gray-100 prose-th:p-3 prose-th:text-left prose-th:border prose-th:border-gray-200
                        prose-td:p-3 prose-td:border prose-td:border-gray-200">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {content}
                        </ReactMarkdown>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default InformesViewerPage;
