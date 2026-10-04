// Ernennt einen registrierten User zum Admin: npm run make-admin -- <username>
const { loadUserDatabase, saveUserDatabase } = require('../src/utils/dbManager');

const makeAdmin = async (username) => {
  const cleanUsername = username?.trim().toLowerCase();
  if (!cleanUsername) {
    throw new Error('Please specify a username: npm run make-admin -- <username>');
  }

  const users = await loadUserDatabase();
  const user = users.find((entry) => entry.username === cleanUsername);
  if (!user) {
    throw new Error(`User "${cleanUsername}" not found. Please register in the app first.`);
  }

  user.role = 'admin';
  await saveUserDatabase(users);
  console.log(`"${cleanUsername}" is now an admin. Reload the page in your browser.`);
};

makeAdmin(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
