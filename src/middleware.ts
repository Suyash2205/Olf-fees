export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/dashboard/:path*", "/students/:path*", "/fees/:path*", "/pending/:path*", "/classes/:path*"],
};
