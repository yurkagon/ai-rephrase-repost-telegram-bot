import mongoose from "mongoose";

abstract class DatabaseService {
  public static async connectDb() {
    try {
      await mongoose.connect(process.env.MONGODB_URI as string)
    } catch (error) {
      console.log(error);
    }
  };
}

export default DatabaseService;
