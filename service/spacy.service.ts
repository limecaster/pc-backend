import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class SpacyService {
  async extractStructuredData(text: string) {
    try {
      const response = await axios.post('http://localhost:8000/extract', {
        text,
      });
      return response.data.data;
    } catch (error) {
      throw new HttpException(
        error.response?.data || 'Error extracting structured data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
