# Variable CRUD Mockups (R10)

This directory contains static HTML mockups demonstrating two alternative designs for implementing CRUD (Create, Read, Update, Delete) operations for single variables in the model editor.

## Mockup Files

### 1. mockup-variable-crud.html
**Standalone Variable Editor Section**

This design adds a new dedicated "Variable Editor" section to the page, separate from the Graph section.

**Features:**
- New section with its own collapsible details panel
- Variable dropdown to select which variable to work with
- Action buttons: New Variable, Edit Variable, Copy Variable, Delete Variable
- Preview pane showing the XML definition of the selected variable
- Modal dialogs for each CRUD operation

**Advantages:**
- Clear separation of concerns (viewing graphs vs. editing variables)
- More space for editor controls and preview
- Doesn't clutter the Graph section
- Better for workflows focused on editing multiple variables

### 2. mockup-variable-crud-graph-integrated.html
**Graph-Integrated Variable Editor**

This design integrates variable editing controls directly into the existing Graph section, near the variable dropdown.

**Features:**
- CRUD buttons (New, Edit, Copy, Delete) placed inline with graph controls
- Uses the same variable dropdown that already exists for graph visualization
- Visual separator between graph controls and edit controls
- Same modal dialogs for CRUD operations

**Advantages:**
- More compact - fewer separate sections on the page
- Natural workflow: select a variable to visualize, then edit it
- Reuses existing variable dropdown
- Less scrolling required

## Modal Dialogs (Common to Both Designs)

### New Variable Modal
- Form fields for creating a new variable:
  - Variable ID (required, unique identifier)
  - Data Type (required: real, integer, string, boolean)
  - Unit (optional)
  - Definition Type (required: constant, expression, table, tableLookup, piecewise)
  - Definition (required: the actual formula or value)
  - Description (optional)
- "Cancel" and "Create Variable" buttons

### Edit Variable Modal
- Similar form to New Variable, but pre-populated with existing variable data
- Variable ID field is disabled (cannot be changed to avoid breaking references)
- Warning message about potential impact on dependent variables
- Shows current XML definition in a preview pane
- "Cancel" and "Save Changes" buttons

### Copy Variable Modal
- Displays source variable (read-only)
- Form fields to define the copied variable (all editable)
- Pre-populated with source variable's data
- New Variable ID field is editable and required
- Shows source variable's XML definition
- "Cancel" and "Create Copy" buttons

### Delete Variable Modal
- Shows prominent warning about irreversible action
- Impact analysis section listing variables that depend on the one being deleted
- Displays XML definition of variable to be deleted
- Confirmation text box requiring user to type the variable ID
- "Really Really Delete" button (disabled until confirmation text matches)
- "Cancel" button

## Design Considerations

### Safety Features
1. **Delete Confirmation**: Requires typing the variable ID to enable the delete button
2. **Impact Analysis**: Shows which variables will be affected by deletion
3. **Warning Messages**: Edit modal warns about potential impacts on dependent variables
4. **Non-Destructive Defaults**: Cancel buttons are secondary style, destructive actions require explicit confirmation

### Validation (Future Implementation)
The mockups show form validation hints:
- Required fields marked with asterisks (*)
- Helper text explaining each field
- Placeholder text showing examples
- Dropdowns with predefined valid options

### User Experience
- **Modal-based dialogs**: Don't navigate away from the main page, maintain context
- **Clear visual hierarchy**: Headers, sections, and buttons use consistent styling
- **Responsive design**: Works with existing mobile-friendly CSS
- **Immediate feedback**: Preview panes show current state
- **Familiar patterns**: Follows conventions from the existing UI

## How to View

1. Navigate to the `docs` directory
2. Serve the files locally:
   ```bash
   python3 -m http.server 8080
   ```
3. Open in browser:
   - http://localhost:8080/mockup-variable-crud.html (Standalone section design)
   - http://localhost:8080/mockup-variable-crud-graph-integrated.html (Graph-integrated design)

## Future Implementation Notes

When implementing the actual functionality:
1. These mockups use inline styles for demonstration - actual implementation should extend the existing `styles/main.css`
2. Modal controls are currently JavaScript-based - consider using the same patterns/library as the rest of the application
3. Form validation should match the XML schema validation already in place
4. The variable preview pane should be dynamically generated from the actual model data
5. Impact analysis for delete should use the existing dependency graph functionality
6. Consider adding real-time validation as users type in form fields
7. Save operations should integrate with the existing model serialization code
8. Consider adding an "undo" feature for edit/delete operations
