import { Navigate, Route, Routes } from "react-router-dom";
import MessengerLayout, { ChatEmptyState } from "./components/MessengerLayout";
import LoginPage from "./pages/LoginPage";
import ChatPage from "./pages/ChatPage";
import CreateGroupPage from "./pages/CreateGroupPage";
import { getAccessToken } from "./api";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getAccessToken()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/create-group"
          element={
            <RequireAuth>
              <CreateGroupPage />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <MessengerLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<ChatEmptyState />} />
          <Route path="/chat/:id" element={<ChatPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
