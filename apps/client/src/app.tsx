import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookOpen,
  Inbox,
  LogOut,
  Radio,
  Route as RouteIcon,
  Send,
  UserRound,
} from 'lucide-react';

import { logout, restore, useSession } from './api';
import { Brand, LanguageSwitch, Loading } from './components';
import { AuthPage } from './auth-page';
import { AccountPage, ChannelsPage, MetricsPage, RoutesPage } from './settings-pages';
import { Workspace } from './workspace';
import { edits } from './editor-state';
import { GuidePage } from './guide-page';

import './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Application />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function Application() {
  const { user, ready } = useSession();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const cache = useQueryClient();

  useEffect(() => {
    void restore();
  }, []);

  if (!ready) return <Loading />;
  if (['/login', '/register'].includes(location.pathname))
    return <AuthPage key={location.pathname} />;
  if (!user) return <Navigate to="/login" replace />;

  const move = (path: string) => {
    if (!edits.dirty || window.confirm(t('discard'))) navigate(path);
  };
  const navigation = [
    { path: '/workspace', label: 'inbox', icon: Inbox },
    { path: '/channels', label: 'channels', icon: Radio },
    { path: '/routes', label: 'routes', icon: RouteIcon },
    { path: '/history', label: 'history', icon: Send },
    { path: '/metrics', label: 'metrics', icon: BarChart3 },
    { path: '/account', label: 'account', icon: UserRound },
    { path: '/guide', label: 'guide', icon: BookOpen },
  ];

  return (
    <div className="app-shell">
      <aside className="navigation">
        <button
          type="button"
          className="nav-brand"
          aria-label={t('inbox')}
          title={t('inbox')}
          onClick={() => move('/workspace')}
        >
          <Brand />
        </button>
        <nav aria-label={t('product')}>
          {navigation.map(({ path, label, icon: Icon }) => (
            <button
              key={path}
              title={t(label)}
              className={location.pathname.startsWith(path) ? 'nav-item current' : 'nav-item'}
              aria-current={location.pathname.startsWith(path) ? 'page' : undefined}
              onClick={() => move(path)}
            >
              <Icon size={21} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
        <div className="nav-bottom">
          <LanguageSwitch />
          <button
            className="nav-item"
            title={t('logout')}
            onClick={() => {
              if (!edits.dirty || window.confirm(t('discard')))
                void logout().finally(() => {
                  cache.clear();
                  navigate('/login');
                });
            }}
          >
            <LogOut size={20} />
            <span>{t('logout')}</span>
          </button>
          <div className="account-avatar" title={user.email}>
            {user.firstName[0]}
            {user.lastName[0]}
          </div>
        </div>
      </aside>
      <main className="app-main">
        <Routes>
          <Route path="/workspace/:postId?" element={<Workspace />} />
          <Route path="/history/:postId?" element={<Workspace />} />
          <Route path="/channels" element={<ChannelsPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/guide" element={<GuidePage />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Routes>
      </main>
    </div>
  );
}
