# Max & Jacob - Website with Backend

Modern website with Node.js backend, SQLite database, and admin panel for managing contact submissions.

## Features

- 🎨 Modern, responsive landing page
- 📝 Project Intake Form with two-column layout
- 💾 SQLite database for storing submissions
- 🔐 Admin panel with password protection
- 📊 View and manage all submissions
- 🔗 Pricing package integration (auto-fill form from pricing page)

## Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Node.js, Express
- **Database**: SQLite3
- **Template Engine**: EJS
- **Session Management**: express-session

## Installation

1. **Install dependencies:**

```bash
npm install
```

2. **Create `.env` file:**

Create a `.env` file in the root directory with the following content:

```env
ADMIN_PASSWORD=your_secure_password_here
SESSION_SECRET=your_random_secret_string_here
PORT=3000
```

⚠️ **Important**: Change the default passwords before deploying to production!

## Running the Application

**Start the server:**

```bash
npm start
```

The application will be available at:
- Website: `http://localhost:3000`
- Admin Panel: `http://localhost:3000/admin`

## Project Structure

```
/
├── server/
│   ├── server.js              # Main Express application
│   ├── db.js                  # SQLite database configuration
│   ├── routes/
│   │   ├── contact.js         # API endpoint for submissions
│   │   └── admin.js           # Admin routes (login, list, detail)
│   └── views/
│       ├── login.ejs          # Admin login page
│       ├── admin-list.ejs     # Submissions list
│       └── admin-detail.ejs   # Single submission detail
├── index.html                 # Main landing page
├── style.css                  # Main stylesheet
├── package.json               # Dependencies
├── .env                       # Environment variables (not in git)
├── .gitignore                 # Git ignore rules
└── data.db                    # SQLite database (created automatically)
```

## API Endpoints

### Public API

**POST `/api/contact-submissions`**
- Submit a new project inquiry
- Required fields: `email`, `budget_range`, `message`
- Optional fields: `name`, `company`, `website`, `needs_help_with`, `industry`, `timeline`, `selected_package`, `has_attachment`

### Admin Routes

**GET `/admin/login`**
- Display login page

**POST `/admin/login`**
- Authenticate admin user

**GET `/admin`**
- List all submissions (protected)

**GET `/admin/:id`**
- View submission detail (protected)

**GET `/admin/logout`**
- Logout admin user

## Database Schema

**Table: `contact_submissions`**

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key (auto-increment) |
| created_at | DATETIME | Timestamp of submission |
| email | TEXT | Contact email (required) |
| name | TEXT | Contact name |
| company | TEXT | Company name |
| website | TEXT | Website URL |
| needs_help_with | TEXT | JSON array of selected services |
| industry | TEXT | Business industry |
| budget_range | TEXT | Selected budget range (required) |
| timeline | TEXT | Preferred timeline |
| message | TEXT | Project description (required) |
| has_attachment | INTEGER | 0 or 1 (file attachment flag) |
| ip_address | TEXT | Client IP address |
| selected_package | TEXT | Pre-selected pricing package |

## Features Explained

### 1. Project Intake Form

Modern two-column form that collects:
- Contact information (left column)
- Project details (right column)
- Full-width message and file upload

### 2. Pricing Integration

Clicking "Order now" on any pricing package:
- Scrolls to the contact form
- Pre-fills the budget dropdown
- Checks the "Website" checkbox
- Shows a banner with selected package

### 3. Admin Panel

Secure admin interface to:
- View all submissions in a table
- Click to see full details
- Filter and search (coming soon)
- Export data (coming soon)

## Security Notes

- Admin password is stored in `.env` (not committed to git)
- Sessions expire after 7 days
- SQL injection protection via parameterized queries
- Input validation on both client and server side

## Development

To modify the frontend:
- Edit `index.html` for structure
- Edit `style.css` for styling
- JavaScript is inline in `index.html`

To modify the backend:
- `server/server.js` - Express configuration
- `server/db.js` - Database functions
- `server/routes/` - API endpoints
- `server/views/` - Admin templates

## Deployment

### Before deploying:

1. ✅ Change `ADMIN_PASSWORD` in `.env`
2. ✅ Generate strong `SESSION_SECRET` 
3. ✅ Set `PORT` if needed
4. ✅ Ensure `data.db` is in `.gitignore`
5. ✅ Use HTTPS in production
6. ✅ Set up backup for `data.db`

### Environment Variables (Production):

```env
ADMIN_PASSWORD=<strong-password>
SESSION_SECRET=<random-64-char-string>
PORT=3000
NODE_ENV=production
```

## Troubleshooting

**Port already in use:**
```bash
# Change PORT in .env or kill the process using port 3000
lsof -ti:3000 | xargs kill
```

**Database locked:**
- Make sure only one instance of the server is running
- Check file permissions on `data.db`

**Admin password not working:**
- Check `.env` file exists and has correct format
- Restart server after changing `.env`

## License

ISC

## Support

For issues or questions, contact: jacob@maxandjacob.com


