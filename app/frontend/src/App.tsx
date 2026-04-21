import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Header } from '@/components/Header';
import { useSocket } from '@/hooks/useSocket';

const SetupPage = lazy(() => import('@/pages/SetupPage'));
const RunPage = lazy(() => import('@/pages/RunPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center flex-1 bg-[#F9F6F1]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-6 w-6 border-2 border-[#5C1A1A] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[#7A5C4A]">Loading…</span>
      </div>
    </div>
  );
}

function App() {
  useSocket();

  return (
    <div className="flex flex-col h-screen bg-[#F9F6F1] text-[#2C1810] overflow-hidden">
      <Header />

      <main className="flex flex-col flex-1 overflow-hidden">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<SetupPage />} />
            <Route path="/run/:runId" element={<RunPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

export default App;
