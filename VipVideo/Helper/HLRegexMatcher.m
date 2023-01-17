//
//  HLRegexMatcher.m
//  VipVideo
//
//  Created by 李红力 on 2023/1/17.
//  Copyright © 2023 SV. All rights reserved.
//

#import "HLRegexMatcher.h"

@implementation HLRegexMatcher

+ (BOOL)isValidVideoUrl:(NSString *)url
{
    NSArray *regexs = @[@"/https://v.qq.com/x/cover/[a-zA-Z0-9]+.html/",
                        @"/https://v.qq.com/x/cover/[a-zA-Z0-9]+/[a-zA-Z0-9]+.html",
                        @"/v.qq.com/x/page/",
                        @"/https?://m.v.qq.com/x/m/play?.*cid.*/",
                        @"/m.v.qq.com/x/play.html?cid=/",
                        @"/m.v.qq.com/play.html?cid=/",
                        @"/m.v.qq.com/cover/.*html/",
                        @"/www.iqiyi.com/",
                        @"/m.iqiyi.com/",
                        @"/www.iq.com/play/",
                        @"/m.youku.com/alipay_video/id_/",
                        @"/m.youku.com/video/id_/",
                        @"/v.youku.com/v_show/id_/",
                        @"/www.bilibili.com/video/",
                        @"/www.bilibili.com/bangumi/",
                        @"/m.bilibili.com/bangumi/",
                        @"/m.bilibili.com/video/",
                        @"/m.mgtv.com/b/",
                        @"/mgtv.com/b|l/",
                        @"/tv.sohu.com/v/",
                        @"/m.tv.sohu.com/",
                        @"/film.sohu.com/album/",
                        @"/le.com/ptv/vplay/",
                        @"/play.tudou.com/v_show/id_/",
                        @"/v.pptv.com/show/",
                        @"/vip.1905.com/play/",
                        @"/www.1905.com/vod/play/",
    ];
    
    for (NSString *regex in regexs) {
        if ([HLRegexMatcher isValidString:url regex:regex]) {
            return YES;
        }
        if ([url containsString:regex]) {
            return YES;
        }
    }
        
    return  NO;
}

// 利用正则匹配字符串。如果合法，则返回YES，否则，NO
+ (BOOL)isValidString:(NSString *)string regex:(NSString *)regex
{
    NSPredicate *predicate = [NSPredicate predicateWithFormat:@"SELF CONTAINS %@", regex];
    return [predicate evaluateWithObject:string];
}

@end
