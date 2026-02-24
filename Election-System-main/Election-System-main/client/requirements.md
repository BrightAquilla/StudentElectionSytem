## Packages
recharts | For visualizing election results (bar charts)
date-fns | For date formatting
framer-motion | For smooth page transitions and animations
lucide-react | For icons (already in base, but good to note)
zod | Schema validation (already in base)

## Notes
- Auth flow uses standard cookie-based sessions
- Protected routes require checking `user.isAdmin` for admin features
- Election creation requires handling date inputs properly
- Voting needs to handle "already voted" error states gracefully
