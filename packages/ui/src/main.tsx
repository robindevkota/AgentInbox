import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import { SubmitPage } from "./submit/SubmitPage";
import { StatusPage } from "./status/StatusPage";
import { PmDashboard } from "./pm/PmDashboard";
import { HomePage } from "./components/HomePage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/submit/:token" element={<SubmitPage />} />
        <Route path="/task/:taskId" element={<StatusPage />} />
        <Route path="/pm" element={<PmDashboard />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
