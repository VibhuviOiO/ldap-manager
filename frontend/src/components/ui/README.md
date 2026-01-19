# UI Components

## Sheet (Slide-in Panel)

Modern slide-in panel that appears from the right side of the screen. Used for forms and settings.

### Usage

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet'

<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Panel Title</SheetTitle>
    </SheetHeader>
    <div>Panel content here</div>
  </SheetContent>
</Sheet>
```

### Features

- **Slides from right**: Modern UX pattern
- **Overlay backdrop**: Dims background content
- **Smooth animations**: Fade in/out with slide
- **Responsive**: Takes 75% width on desktop, full width on mobile
- **Scrollable**: Content scrolls if too tall
- **Close button**: X button in top-right corner
- **Click outside**: Closes when clicking backdrop

### Used In

- **CreateUserDialog**: User creation form
- **ColumnSettings**: Column visibility settings

### Why Sheet vs Dialog?

| Feature | Dialog (Old) | Sheet (New) |
|---------|-------------|-------------|
| Position | Center | Right side |
| Animation | Fade | Slide + Fade |
| Space | Limited | Full height |
| Modern | ❌ | ✅ |
| Forms | Cramped | Spacious |

### Styling

The Sheet component uses:
- `w-3/4` - 75% width on desktop
- `sm:max-w-2xl` - Max 2xl width on small screens
- `inset-y-0 right-0` - Full height, right side
- `slide-in-from-right` - Slide animation
- `overflow-y-auto` - Scrollable content
