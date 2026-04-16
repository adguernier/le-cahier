import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),
  route("months", "routes/months.tsx"),
  route("months/:yyyymm", "routes/month-detail.tsx"),
  route("settings/members", "routes/settings-members.tsx"),
  route("settings/categories", "routes/settings-categories.tsx"),
] satisfies RouteConfig;
