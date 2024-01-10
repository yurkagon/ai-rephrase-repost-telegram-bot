import mongoose from "mongoose";

abstract class DatabaseService<T> {
  protected model: mongoose.Model<T>;

  public async findOrCreate(id: number): Promise<T> {
    const entity = await this.model.findOne({ _id: id }).exec();
    if (entity) return entity;

    const newEntity = new this.model({ _id: id });
    await newEntity.save();

    return newEntity;
  }

  public static async connectDb() {
    try {
      await mongoose.connect(process.env.MONGODB_URI as string);
    } catch (error) {
      console.log(error);
    }
  }
}

export default DatabaseService;
