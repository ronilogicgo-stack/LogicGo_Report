import "./globals.css";

export const metadata = {
  title: "Sales Tracker",
  description: "Sales person wise monthly sales & collection tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
