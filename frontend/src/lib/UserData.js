/**
 * UserData class for managing drawing data per user
 */
class UserData {
  constructor(userId, username) {
    this.userId = userId;
    this.username = username;
    this.drawings = [];
  }

  addDrawing(drawing) {
    this.drawings.push(drawing);
  }

  clearDrawings() {
    this.drawings = [];
  }
}

export default UserData;
