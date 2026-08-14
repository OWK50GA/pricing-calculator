import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute }       from "@/components/ProtectedRoute";
import { LoginPage }            from "@/pages/auth/LoginPage";
import { RegisterPage }         from "@/pages/auth/RegisterPage";
import { DocumentsPage }        from "@/pages/documents/DocumentsPage";
import { DocumentDetailPage }   from "@/pages/documents/DocumentDetailPage";
import { ReportsPage }          from "@/pages/reports/ReportsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login"    element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/documents"     element={<DocumentsPage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/reports"       element={<ReportsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/documents" replace />} />
    </Routes>
  );
}
