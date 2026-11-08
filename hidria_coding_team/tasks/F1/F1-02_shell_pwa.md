---
id: F1-02
fase: F1
titulo: Shell PWA — router, layout, sesión, tema
owner: dev-frontend-pwa
estado: pendiente
prioridad: P0
deps: [F1-01]
write_scope: ["app/**", "reports/F1/F1-02_*"]
evidencia: ["reports/F1/F1-02_shell_pwa.md"]
---

# F1-02 — Shell PWA

## Objetivo

Base del cliente: React Router, layout autenticado, navegación por módulos, tema
institucional, manifest + service worker, instalación PWA y estados offline/online.

## Entregables

- Router con rutas M1–M13 (placeholders enlazados).
- Layout (header, nav, breadcrumbs, sesión, selector de organización).
- PWA instalable (manifest, SW, icons), aviso de versión nueva.
- Tema Tailwind con tokens institucionales; accesibilidad base.
- `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (sin `service_role`).

## Criterios de aceptación

- [ ] `npm run build` verde; app instalable.
- [ ] Rutas protegidas redirigen a login.
- [ ] Lighthouse PWA ≥ 90 (staging).
- [ ] Sin secretos en bundle.
