// Canonical game catalog. Later this could live in DynamoDB.
const GAMES = [
  { id: "hearts", name: "Hearts", description: "Classic trick-taking game. Avoid the queen of spades.", minPlayers: 4, maxPlayers: 4, status: "coming-soon" },
  { id: "spades", name: "Spades", description: "Partnership bidding game with spades as trump.", minPlayers: 4, maxPlayers: 4, status: "coming-soon" },
  { id: "poker", name: "Texas Hold'em", description: "The world's most popular poker variant.", minPlayers: 2, maxPlayers: 9, status: "coming-soon" },
  { id: "rummy", name: "Gin Rummy", description: "Draw, discard, and be the first to knock.", minPlayers: 2, maxPlayers: 2, status: "coming-soon" },
];

const byId = (id) => GAMES.find((g) => g.id === id);

module.exports = { GAMES, byId };