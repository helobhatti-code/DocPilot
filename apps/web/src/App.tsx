import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import ProtectedRoute from '@/components/ProtectedRoute';

const Login               = lazy(() => import('@/pages/auth/Login'));
const SetupAccount        = lazy(() => import('@/pages/auth/SetupAccount'));
const ForgotPassword      = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword       = lazy(() => import('@/pages/auth/ResetPassword'));

const Dashboard           = lazy(() => import('@/pages/Dashboard'));
const PassesList          = lazy(() => import('@/pages/passes/PassesList'));
const PassEdit            = lazy(() => import('@/pages/passes/PassEdit'));
const PassDetail          = lazy(() => import('@/pages/passes/PassDetail'));
const BulkImport          = lazy(() => import('@/pages/passes/BulkImport'));
const Staff               = lazy(() => import('@/pages/Staff'));
const Reports             = lazy(() => import('@/pages/Reports'));
const ReportView          = lazy(() => import('@/pages/ReportView'));
const Notifications       = lazy(() => import('@/pages/Notifications'));
const Renewals            = lazy(() => import('@/pages/Renewals'));
const Cancellations       = lazy(() => import('@/pages/Cancellations'));

const Settings            = lazy(() => import('@/pages/system/Settings'));
const Roles               = lazy(() => import('@/pages/system/Roles'));
const Users               = lazy(() => import('@/pages/system/Users'));
const Audit               = lazy(() => import('@/pages/system/Audit'));
const NotificationTemplates = lazy(() => import('@/pages/system/NotificationTemplates'));
const SubcontractorOrgs   = lazy(() => import('@/pages/system/SubcontractorOrgs'));
const MasterControlPanel  = lazy(() => import('@/pages/super-admin/MasterControlPanel'));
const ImpersonateStart    = lazy(() => import('@/pages/ImpersonateStart'));

const VehiclesList        = lazy(() => import('@/pages/vehicles/VehiclesList'));
const VehicleForm         = lazy(() => import('@/pages/vehicles/VehicleForm'));
const MachineryList       = lazy(() => import('@/pages/machinery/MachineryList'));
const MachineryForm       = lazy(() => import('@/pages/machinery/MachineryForm'));
const CompanyDocumentsList = lazy(() => import('@/pages/company-documents/index'));
const CompanyDocumentForm  = lazy(() => import('@/pages/company-documents/CompanyDocumentForm'));
const ExpiryDashboard      = lazy(() => import('@/pages/expiry-dashboard'));
const AlarmThresholds      = lazy(() => import('@/pages/system/AlarmThresholds'));

function PageFallback() {
  return <div className="p-6 text-text-secondary">Loading…</div>;
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public routes */}
        <Route path="/impersonate"     element={<ImpersonateStart />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/setup-account"   element={<SetupAccount />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />

        {/* Authenticated layout */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/"           element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"  element={<Dashboard />} />

          <Route path="/passes"           element={<PassesList />} />
          <Route path="/passes/new"       element={<PassEdit />} />
          <Route path="/passes/import"    element={<BulkImport />} />
          <Route path="/passes/:id"       element={<PassDetail />} />
          <Route path="/passes/:id/edit"  element={<PassEdit />} />

          <Route path="/staff"         element={<Staff />} />
          <Route path="/reports"       element={<Reports />} />
          <Route path="/reports/:type" element={<ReportView />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/renewals"      element={<Renewals />} />
          <Route path="/cancellations" element={<Cancellations />} />

          <Route path="/vehicles"          element={<VehiclesList />} />
          <Route path="/vehicles/new"      element={<VehicleForm />} />
          <Route path="/vehicles/:id/edit" element={<VehicleForm />} />

          <Route path="/machinery"          element={<MachineryList />} />
          <Route path="/machinery/new"      element={<MachineryForm />} />
          <Route path="/machinery/:id/edit" element={<MachineryForm />} />

          {/* Employees module merged into Staff (People). Old links redirect. */}
          <Route path="/employees"          element={<Navigate to="/staff?personType=DIRECT_EMPLOYEE" replace />} />
          <Route path="/employees/new"      element={<Navigate to="/staff" replace />} />
          <Route path="/employees/:id/edit" element={<Navigate to="/staff" replace />} />

          <Route path="/company-documents"              element={<CompanyDocumentsList />} />
          <Route path="/company-documents/new"          element={<CompanyDocumentForm />} />
          <Route path="/company-documents/:id/edit"     element={<CompanyDocumentForm />} />

          <Route path="/expiry-dashboard"               element={<ExpiryDashboard />} />

          <Route path="/system/settings" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><Settings /></ProtectedRoute>
          } />
          <Route path="/system/roles" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><Roles /></ProtectedRoute>
          } />
          <Route path="/system/users" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><Users /></ProtectedRoute>
          } />
          <Route path="/system/audit" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><Audit /></ProtectedRoute>
          } />
          <Route path="/system/subcontractors" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN', 'PM', 'HR']}><SubcontractorOrgs /></ProtectedRoute>
          } />
          <Route path="/system/notification-templates" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><NotificationTemplates /></ProtectedRoute>
          } />
          <Route path="/system/alarm-thresholds" element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}><AlarmThresholds /></ProtectedRoute>
          } />

          {/* Super Admin only */}
          <Route path="/super-admin" element={
            <ProtectedRoute roles={['SUPER_ADMIN']}><MasterControlPanel /></ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
