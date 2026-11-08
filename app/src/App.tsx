import { RouterProvider } from 'react-router-dom';
import { router } from './router';

/** Raíz del cliente HIDRIA: proveedor de rutas (F1-02). */
export default function App() {
  return <RouterProvider router={router} />;
}
