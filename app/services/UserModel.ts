import UserModel, { User } from "../models/user";
import DatabaseService from "./DatabaseService";

class UserService extends DatabaseService<User> {
  protected model = UserModel;
}

const instance = new UserService();

export default instance;
