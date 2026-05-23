import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

/**
 * @deprecated This component is legacy and has been replaced by individual module pages.
 * Routing is now handled in App.jsx pointing to /admin/*
 * converting this to a simple redirect/hub page for now.
 */
const AdminDashboard = () => {
    const navigate = useNavigate();

    return (
        <div className="p-8 flex items-center justify-center h-full">
            <Card className="max-w-md w-full text-center p-6 bg-yellow-50 border-yellow-200">
                <CardContent>
                    <h2 className="text-2xl font-bold text-yellow-800 mb-4">⚠️ Componente Legacy</h2>
                    <p className="text-gray-700 mb-6">
                        El <b>AdminDashboard</b> antiguo ha sido migrado. Por favor utilice el menú de navegación lateral para acceder a los módulos.
                    </p>
                    <div className="grid gap-3">
                        <Button onClick={() => navigate('/admin')}>Ir al Dashboard Principal</Button>
                        <Button variant="outline" onClick={() => navigate('/admin/clients')}>Ver Socios</Button>
                        <Button variant="outline" onClick={() => navigate('/admin/loans')}>Ver Préstamos</Button>
                        <Button variant="outline" onClick={() => navigate('/admin/payments')}>Ver Pagos</Button>
                        <Button variant="outline" onClick={() => navigate('/admin/savings')}>Ver Ahorros</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default AdminDashboard;